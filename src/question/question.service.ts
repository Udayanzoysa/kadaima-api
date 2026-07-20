import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
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
import {
  asLocalized,
  jsonDownload,
  parseJsonBuffer,
  readWorkbook,
  sheetToRows,
  xlsxDownload,
  type Localized,
} from '../common/backup/backup.util';

const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

type ExportQuestion = {
  questionText: Localized;
  type: QuestionType;
  points: number;
  status: QuestionStatus;
  imageUrl: string | null;
  config: Record<string, unknown>;
  choices: Array<{
    choiceText: Localized;
    isCorrect: boolean;
    imageUrl?: string | null;
  }>;
};

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

  async listPaginated(opts: {
    status?: QuestionStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
    const where = opts.status ? { status: opts.status } : undefined;

    const [total, items] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkUpdateStatus(ids: string[], status: QuestionStatus) {
    if (!ids.length) throw new BadRequestException('No question IDs provided');
    const result = await this.prisma.question.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: result.count, status };
  }

  async bulkDelete(ids: string[]) {
    if (!ids.length) throw new BadRequestException('No question IDs provided');

    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { quizLinks: true, responses: true } } },
    });

    let deleted = 0;
    let archived = 0;

    for (const question of questions) {
      if (question._count.responses > 0 || question._count.quizLinks > 0) {
        await this.prisma.question.update({
          where: { id: question.id },
          data: { status: QuestionStatus.Archived },
        });
        archived += 1;
      } else {
        await this.prisma.question.delete({ where: { id: question.id } });
        deleted += 1;
      }
    }

    return { deleted, archived, total: questions.length };
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
                    imageUrl: choice.imageUrl ?? null,
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
                imageUrl: choice.imageUrl ?? null,
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

  private toExportQuestion(q: {
    questionText: Prisma.JsonValue;
    type: QuestionType;
    points: number;
    status: QuestionStatus;
    imageUrl: string | null;
    config: Prisma.JsonValue;
    choices: Array<{
      choiceText: Prisma.JsonValue;
      isCorrect: boolean;
      imageUrl?: string | null;
    }>;
  }): ExportQuestion {
    return {
      questionText: asLocalized(q.questionText),
      type: q.type,
      points: q.points,
      status: q.status,
      imageUrl: q.imageUrl,
      config:
        q.config && typeof q.config === 'object' && !Array.isArray(q.config)
          ? (q.config as Record<string, unknown>)
          : {},
      choices: q.choices.map((c) => ({
        choiceText: asLocalized(c.choiceText),
        isCorrect: c.isCorrect,
        imageUrl: c.imageUrl ?? null,
      })),
    };
  }

  async exportBackup(format: 'json' | 'xlsx' = 'json') {
    const rows = await this.prisma.question.findMany({
      orderBy: { createdAt: 'asc' },
      include: { choices: { orderBy: { id: 'asc' } } },
    });
    const questions = rows.map((q) => this.toExportQuestion(q));
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const sheetRows = questions.map((q) => {
        const row: Record<string, string | number> = {
          question_en: q.questionText.en,
          question_si: q.questionText.si,
          question_ta: q.questionText.ta,
          type: q.type,
          points: q.points,
          status: q.status,
          correct: '',
          accepted_answers: '',
          accepted_answers_si: '',
          accepted_answers_ta: '',
          tolerance: '',
          match_mode: '',
        };

        OPTION_LETTERS.forEach((letter, i) => {
          const choice = q.choices[i];
          row[`option_${letter}`] = choice?.choiceText.en ?? '';
          row[`option_${letter}_si`] = choice?.choiceText.si ?? '';
          row[`option_${letter}_ta`] = choice?.choiceText.ta ?? '';
        });

        if (q.type === QuestionType.MCQ) {
          const correctIndex = q.choices.findIndex((c) => c.isCorrect);
          if (correctIndex >= 0 && correctIndex < OPTION_LETTERS.length) {
            row.correct = OPTION_LETTERS[correctIndex].toUpperCase();
          }
        }

        const cfg = q.config ?? {};
        if (q.type === QuestionType.SHORT_TEXT || q.type === QuestionType.NUMERIC) {
          const accepted = Array.isArray(cfg.acceptedAnswers)
            ? (cfg.acceptedAnswers as Array<{ en?: string; si?: string; ta?: string }>)
            : [];
          row.accepted_answers = accepted.map((a) => a.en ?? '').filter(Boolean).join('|');
          row.accepted_answers_si = accepted.map((a) => a.si ?? '').filter(Boolean).join('|');
          row.accepted_answers_ta = accepted.map((a) => a.ta ?? '').filter(Boolean).join('|');
          if (typeof cfg.tolerance === 'number') row.tolerance = cfg.tolerance;
          if (typeof cfg.matchMode === 'string') row.match_mode = cfg.matchMode;
        }

        return row;
      });

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
      return xlsxDownload(workbook, `questions-backup-${stamp}.xlsx`);
    }

    return jsonDownload(
      {
        version: 1,
        type: 'questions',
        exportedAt: new Date().toISOString(),
        count: questions.length,
        questions,
      },
      `questions-backup-${stamp}.json`,
    );
  }

  private parseImportPayload(raw: unknown): ExportQuestion[] {
    if (Array.isArray(raw)) {
      return raw as ExportQuestion[];
    }
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.questions)) return obj.questions as ExportQuestion[];
    }
    throw new BadRequestException(
      'Invalid backup file. Expected { type: "questions", questions: [...] } or an array.',
    );
  }

  private rowToQuestion(row: Record<string, string>, rowNum: number): ExportQuestion {
    const typeRaw = (row.type || 'MCQ').toUpperCase();
    if (!Object.values(QuestionType).includes(typeRaw as QuestionType)) {
      throw new BadRequestException(`Row ${rowNum}: invalid type "${row.type}"`);
    }
    const type = typeRaw as QuestionType;
    const points = Math.max(1, Number(row.points) || 1);
    const statusRaw = row.status || QuestionStatus.Draft;
    if (!Object.values(QuestionStatus).includes(statusRaw as QuestionStatus)) {
      throw new BadRequestException(`Row ${rowNum}: invalid status "${row.status}"`);
    }

    const questionText = asLocalized({
      en: row.question_en || row.question || '',
      si: row.question_si || '',
      ta: row.question_ta || '',
    });
    if (!questionText.en.trim()) {
      throw new BadRequestException(`Row ${rowNum}: question_en is required`);
    }

    const choices: ExportQuestion['choices'] = [];
    const correctLetter = (row.correct || '').trim().toLowerCase();
    for (const letter of OPTION_LETTERS) {
      const en = row[`option_${letter}`] || row[`option_${letter}_en`] || '';
      if (!en.trim()) continue;
      choices.push({
        choiceText: asLocalized({
          en,
          si: row[`option_${letter}_si`] || '',
          ta: row[`option_${letter}_ta`] || '',
        }),
        isCorrect: correctLetter === letter,
      });
    }

    const config: Record<string, unknown> = {};
    if (type === QuestionType.SHORT_TEXT || type === QuestionType.NUMERIC) {
      const ens = (row.accepted_answers || '').split('|').map((s) => s.trim()).filter(Boolean);
      const sis = (row.accepted_answers_si || '').split('|').map((s) => s.trim());
      const tas = (row.accepted_answers_ta || '').split('|').map((s) => s.trim());
      if (ens.length) {
        config.acceptedAnswers = ens.map((en, i) => ({
          en,
          si: sis[i] || '',
          ta: tas[i] || '',
        }));
      }
      if (row.tolerance) config.tolerance = Number(row.tolerance) || 0;
      if (row.match_mode) config.matchMode = row.match_mode;
    }

    return {
      questionText,
      type,
      points,
      status: statusRaw as QuestionStatus,
      imageUrl: null,
      config,
      choices,
    };
  }

  async importBackup(file: Express.Multer.File, userId: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Backup file is required');
    }

    const name = (file.originalname || '').toLowerCase();
    let items: ExportQuestion[] = [];

    if (name.endsWith('.json') || file.mimetype === 'application/json') {
      items = this.parseImportPayload(parseJsonBuffer(file.buffer));
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const workbook = readWorkbook(file.buffer);
      const sheet =
        workbook.Sheets.Questions ||
        workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new BadRequestException('Excel file has no sheets');
      const rows = sheetToRows(sheet);
      items = rows.map((row, i) => this.rowToQuestion(row, i + 2));
    } else {
      throw new BadRequestException('Supported formats: .json, .xlsx');
    }

    if (!items.length) {
      throw new BadRequestException('No questions found in backup file');
    }

    let created = 0;
    const failures: string[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        const dto: CreateBankQuestionDto = {
          questionText: asLocalized(item.questionText),
          type: item.type ?? QuestionType.MCQ,
          points: item.points ?? 1,
          status: item.status ?? QuestionStatus.Draft,
          imageUrl: item.imageUrl ?? null,
          config: item.config ?? {},
          choices: (item.choices ?? []).map((c) => ({
            choiceText: asLocalized(c.choiceText),
            isCorrect: Boolean(c.isCorrect),
            imageUrl: c.imageUrl ?? null,
          })),
        };
        await this.create(dto, userId);
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`Item ${i + 1}: ${msg}`);
      }
    }

    return {
      created,
      failed: failures.length,
      total: items.length,
      failures: failures.slice(0, 25),
    };
  }
}
