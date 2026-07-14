import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBankQuestionDto,
  UpdateBankQuestionDto,
} from './dto/bank-question.dto';
import { Prisma, QuestionStatus, QuestionType } from '@prisma/client';
import {
  parseQuestionConfig,
  typeRequiresChoices,
  validateQuestionPayload,
} from './question-config';

function toJson(value: { en: string; si: string; ta: string }): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class QuestionService {
  constructor(private prisma: PrismaService) {}

  async list(status?: QuestionStatus) {
    return this.prisma.question.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        choices: true,
        createdBy: { select: { id: true, email: true, name: true } },
        _count: { select: { quizLinks: true, responses: true } },
        quizLinks: {
          include: {
            quiz: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });
  }

  async getById(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        choices: true,
        createdBy: { select: { id: true, email: true, name: true } },
        quizLinks: {
          include: {
            quiz: { select: { id: true, title: true, status: true } },
          },
        },
        _count: { select: { quizLinks: true, responses: true } },
      },
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  private resolveConfig(
    type: QuestionType,
    config: Record<string, unknown> | undefined,
    choiceIds: string[],
  ): Prisma.InputJsonValue {
    const parsed = parseQuestionConfig(config);
    if (type === QuestionType.SEQUENCE && !parsed.correctOrder?.length) {
      parsed.correctOrder = choiceIds;
    }
    if (type === QuestionType.ESSAY) {
      parsed.contentFormat = parsed.contentFormat ?? 'plain';
    }
    return parsed as Prisma.InputJsonValue;
  }

  async create(dto: CreateBankQuestionDto, userId: string) {
    const type = dto.type ?? QuestionType.MCQ;
    const choices = dto.choices ?? [];
    const error = validateQuestionPayload({
      type,
      choices,
      config: parseQuestionConfig(dto.config),
    });
    if (error) throw new BadRequestException(error);

    if (typeRequiresChoices(type) && choices.length < 2) {
      throw new BadRequestException('At least two choices/items are required.');
    }

    // Create choices first in a transaction so SEQUENCE correctOrder can use real IDs.
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          questionText: toJson(dto.questionText),
          type,
          points: dto.points ?? 1,
          status: dto.status ?? QuestionStatus.Draft,
          imageUrl: dto.imageUrl ?? null,
          config: {},
          createdById: userId,
          choices:
            choices.length > 0
              ? {
                  create: choices.map((choice) => ({
                    choiceText: toJson(choice.choiceText),
                    isCorrect:
                      type === QuestionType.MCQ ? Boolean(choice.isCorrect) : false,
                  })),
                }
              : undefined,
        },
        include: { choices: true },
      });

      const choiceIds = question.choices.map((c) => c.id);
      // If client sent correctOrder as temporary form IDs, map by index from choices array order.
      let config = parseQuestionConfig(dto.config);
      if (type === QuestionType.SEQUENCE) {
        if (config.correctOrder?.length === choiceIds.length) {
          // Prefer order of choices array as authored (correct order); ignore stale temp IDs.
          config.correctOrder = choiceIds;
        } else {
          config.correctOrder = choiceIds;
        }
      }

      return tx.question.update({
        where: { id: question.id },
        data: {
          config: this.resolveConfig(type, config as Record<string, unknown>, choiceIds),
        },
        include: { choices: true },
      });
    });
  }

  async update(id: string, dto: UpdateBankQuestionDto) {
    const existing = await this.prisma.question.findUnique({
      where: { id },
      include: { choices: true },
    });
    if (!existing) throw new NotFoundException('Question not found');

    const type = dto.type ?? existing.type;
    const choices = dto.choices;
    if (choices) {
      const error = validateQuestionPayload({
        type,
        choices,
        config: parseQuestionConfig(dto.config ?? existing.config),
      });
      if (error) throw new BadRequestException(error);
    } else if (dto.config || dto.type) {
      const error = validateQuestionPayload({
        type,
        choices: existing.choices.map((c) => ({
          isCorrect: c.isCorrect,
          choiceText: { en: "" },
        })),
        config: parseQuestionConfig(dto.config ?? existing.config),
      });
      if (error) throw new BadRequestException(error);
    }

    return this.prisma.$transaction(async (tx) => {
      let choiceIds = existing.choices.map((c) => c.id);

      if (choices) {
        await tx.answerChoice.deleteMany({ where: { questionId: id } });
        const created: Array<{ id: string }> = [];
        for (const choice of choices) {
          created.push(
            await tx.answerChoice.create({
              data: {
                questionId: id,
                choiceText: toJson(choice.choiceText),
                isCorrect:
                  type === QuestionType.MCQ ? Boolean(choice.isCorrect) : false,
              },
            }),
          );
        }
        choiceIds = created.map((c) => c.id);
      }

      let configRaw = dto.config;
      if (type === QuestionType.SEQUENCE && (choices || dto.config)) {
        const parsed = parseQuestionConfig(dto.config ?? existing.config);
        parsed.correctOrder = choiceIds;
        configRaw = parsed as Record<string, unknown>;
      }

      return tx.question.update({
        where: { id },
        data: {
          questionText: dto.questionText ? toJson(dto.questionText) : undefined,
          type: dto.type,
          points: dto.points,
          status: dto.status,
          imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl,
          config:
            configRaw !== undefined
              ? this.resolveConfig(
                  type,
                  configRaw as Record<string, unknown>,
                  choiceIds,
                )
              : undefined,
        },
        include: {
          choices: true,
          quizLinks: {
            include: { quiz: { select: { id: true, title: true, status: true } } },
          },
        },
      });
    });
  }

  async updateStatus(id: string, status: QuestionStatus) {
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Question not found');
    return this.prisma.question.update({
      where: { id },
      data: { status },
      include: { choices: true },
    });
  }

  /**
   * Hard-deletes only when unused; otherwise archives.
   */
  async delete(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { _count: { select: { quizLinks: true, responses: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    if (question._count.responses > 0 || question._count.quizLinks > 0) {
      await this.prisma.question.update({
        where: { id },
        data: { status: QuestionStatus.Archived },
      });
      return {
        archived: true,
        message:
          'Question is linked to quizzes or has responses and was archived instead of deleted.',
        question: await this.getById(id),
      };
    }

    await this.prisma.question.delete({ where: { id } });
    return { deleted: true, id };
  }
}
