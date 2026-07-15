import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { AttemptStatus, QuestionStatus, QuizStatus, Prisma } from '@prisma/client';
import { publicQuestionConfig } from '../question/question-config';

function toJson(value: { en: string; si: string; ta: string }): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function shuffleIds(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const questionSelect = (revealAnswers: boolean) => ({
  id: true,
  questionText: true,
  type: true,
  points: true,
  status: true,
  imageUrl: true,
  config: true,
  choices: {
    select: {
      id: true,
      choiceText: true,
      isCorrect: revealAnswers,
    },
  },
} as const);

/** Heartbeats arrive every ~5s; gaps larger than this are treated as disconnect pauses. */
const HEARTBEAT_ACTIVE_MAX_GAP_SECONDS = 12;
const MAX_TAB_VIOLATIONS = 3;

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async getCourses() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { quizzes: true, modules: true } } },
    });
  }

  async createCourse(title: string | { en: string; si: string; ta: string }) {
    const localized =
      typeof title === 'string'
        ? { en: title, si: title, ta: title }
        : title;
    return this.prisma.course.create({
      data: { title: toJson(localized) },
    });
  }

  async listQuizzes(status?: QuizStatus) {
    const quizzes = await this.prisma.quiz.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        course: true,
        module: { select: { id: true, title: true } },
        createdBy: { select: { id: true, email: true, name: true } },
        _count: { select: { quizQuestions: true, attempts: true } },
      },
    });
    return quizzes.map((q) => ({
      ...q,
      priceLkr: q.priceLkr != null ? Number(q.priceLkr) : null,
      _count: {
        questions: q._count.quizQuestions,
        attempts: q._count.attempts,
      },
    }));
  }

  /** Shape quizQuestions into a flat `questions` array for API consumers. */
  private mapQuizWithQuestions<
    T extends {
      quizQuestions: Array<{
        sortOrder: number;
        question: {
          id: string;
          questionText: unknown;
          type: unknown;
          points: number;
          status?: QuestionStatus;
          imageUrl?: string | null;
          config?: unknown;
          choices: unknown[];
        };
      }>;
    },
  >(quiz: T, opts?: { revealAnswers?: boolean }) {
    const reveal = opts?.revealAnswers ?? true;
    const { quizQuestions, ...rest } = quiz;
    const questions = [...quizQuestions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => ({
        ...link.question,
        config: reveal
          ? link.question.config ?? {}
          : publicQuestionConfig(link.question.config),
        sortOrder: link.sortOrder,
      }));
    return { ...rest, questions, _count: { questions: questions.length } };
  }

  async getQuizById(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        course: true,
        module: { select: { id: true, title: true, courseId: true } },
        quizQuestions: {
          orderBy: { sortOrder: 'asc' },
          include: { question: { include: { choices: true } } },
        },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    const mapped = this.mapQuizWithQuestions(quiz);
    return {
      ...mapped,
      priceLkr: quiz.priceLkr != null ? Number(quiz.priceLkr) : null,
    };
  }

  /** Public catalog — published quizzes only, no question content. */
  async listPublishedQuizzes(guestSessionId?: string, userId?: string) {
    const quizzes = await this.prisma.quiz.findMany({
      where: { status: QuizStatus.Published },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
        durationMinutes: true,
        passingScorePercentage: true,
        maxAttempts: true,
        shuffleQuestions: true,
        requiresUnlock: true,
        priceLkr: true,
        course: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
        _count: { select: { quizQuestions: true, attempts: true } },
      },
    });

    const unlockedIds = new Set<string>();
    const quizIds = quizzes.map((q) => q.id);
    if (userId && quizIds.length) {
      const unlocks = await this.prisma.quizUnlock.findMany({
        where: { userId, quizId: { in: quizIds } },
        select: { quizId: true },
      });
      unlocks.forEach((u) => unlockedIds.add(u.quizId));
    }
    if (guestSessionId && quizIds.length) {
      const unlocks = await this.prisma.quizUnlock.findMany({
        where: { guestSessionId, quizId: { in: quizIds } },
        select: { quizId: true },
      });
      unlocks.forEach((u) => unlockedIds.add(u.quizId));
    }

    return quizzes.map((q) => ({
      ...q,
      priceLkr: q.priceLkr != null ? Number(q.priceLkr) : null,
      unlocked: q.requiresUnlock ? unlockedIds.has(q.id) : true,
      _count: {
        questions: q._count.quizQuestions,
        attempts: q._count.attempts,
      },
    }));
  }

  async getQuizAccess(quizId: string, guestSessionId?: string, userId?: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, status: QuizStatus.Published },
      select: {
        id: true,
        requiresUnlock: true,
        priceLkr: true,
        title: true,
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found or not published');

    const unlocked = await this.isQuizUnlocked(quizId, {
      guestSessionId,
      userId,
    });

    return {
      quizId: quiz.id,
      requiresUnlock: quiz.requiresUnlock,
      priceLkr: quiz.priceLkr != null ? Number(quiz.priceLkr) : null,
      unlocked: quiz.requiresUnlock ? unlocked : true,
    };
  }

  async isQuizUnlocked(
    quizId: string,
    opts: { guestSessionId?: string; userId?: string },
  ): Promise<boolean> {
    if (opts.guestSessionId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, guestSessionId: opts.guestSessionId },
        select: { id: true },
      });
      if (row) return true;
    }
    if (opts.userId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, userId: opts.userId },
        select: { id: true },
      });
      if (row) return true;
    }
    return false;
  }

  private async assertQuizUnlocked(
    quiz: { id: string; requiresUnlock: boolean },
    opts: { guestSessionId?: string; userId?: string },
  ) {
    if (!quiz.requiresUnlock) return;
    const unlocked = await this.isQuizUnlocked(quiz.id, opts);
    if (!unlocked) {
      throw new ForbiddenException(
        'This quiz requires payment verification before you can attempt it.',
      );
    }
  }

  /**
   * Public quiz preview for guest take — questions + choices, but never
   * exposes `isCorrect` (anti-cheat).
   */
  async getPublishedQuizForGuest(
    id: string,
    guestSessionId?: string,
    userId?: string,
  ) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id, status: QuizStatus.Published },
      include: {
        course: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
        quizQuestions: {
          orderBy: { sortOrder: 'asc' },
          where: { question: { status: QuestionStatus.Published } },
          include: {
            question: {
              select: questionSelect(false),
            },
          },
        },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found or not published');
    const mapped = this.mapQuizWithQuestions(quiz, { revealAnswers: false });
    const unlocked = quiz.requiresUnlock
      ? await this.isQuizUnlocked(id, { guestSessionId, userId })
      : true;
    return {
      ...mapped,
      requiresUnlock: quiz.requiresUnlock,
      priceLkr: quiz.priceLkr != null ? Number(quiz.priceLkr) : null,
      unlocked,
      _count: {
        questions: mapped._count.questions,
        attempts: quiz._count.attempts,
      },
    };
  }

  private async resolveQuestionOrder(
    quizId: string,
    shuffle: boolean,
  ): Promise<string[] | null> {
    const links = await this.prisma.quizQuestion.findMany({
      where: {
        quizId,
        question: { status: { not: QuestionStatus.Archived } },
      },
      orderBy: { sortOrder: 'asc' },
      select: { questionId: true },
    });
    const ids = links.map((l) => l.questionId);
    if (!ids.length) return [];
    return shuffle ? shuffleIds(ids) : null;
  }

  /**
   * Upserts a guest lead by guestSessionId, then starts (or resumes) a guest attempt.
   */
  async startGuestAttempt(
    quizId: string,
    lead: {
      guestSessionId: string;
      studentName: string;
      school: string;
      mobileNumber: string;
      email?: string;
    },
  ) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== QuizStatus.Published) {
      throw new BadRequestException('This quiz is not currently available to take.');
    }

    await this.assertQuizUnlocked(quiz, {
      guestSessionId: lead.guestSessionId,
    });

    const guestLead = await this.prisma.guestLead.upsert({
      where: { guestSessionId: lead.guestSessionId },
      create: {
        guestSessionId: lead.guestSessionId,
        studentName: lead.studentName,
        school: lead.school,
        mobileNumber: lead.mobileNumber,
        email: lead.email || null,
      },
      update: {
        studentName: lead.studentName,
        school: lead.school,
        mobileNumber: lead.mobileNumber,
        email: lead.email || null,
      },
    });

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, guestLeadId: guestLead.id },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, secondsRemaining: true },
    });

    const decision = await this.resolveRetakeEligibility(
      attempts,
      quiz.maxAttempts ?? 1,
    );

    if (decision.action === 'resume') {
      await this.prisma.quizAttempt.update({
        where: { id: decision.attemptId },
        data: {
          lastActivityAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      });
      return this.getAttemptForStudent(decision.attemptId);
    }

    if (decision.action === 'reject') {
      throw new BadRequestException(decision.message);
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + quiz.durationMinutes);
    const secondsRemaining = quiz.durationMinutes * 60;
    const questionOrder = await this.resolveQuestionOrder(
      quizId,
      quiz.shuffleQuestions,
    );

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        guestLeadId: guestLead.id,
        studentId: null,
        resultToken: randomUUID(),
        expiresAt,
        secondsRemaining,
        violationCount: 0,
        lastHeartbeatAt: now,
        lastActivityAt: now,
        questionOrder: questionOrder ?? undefined,
        status: AttemptStatus.In_Progress,
      },
    });

    await this.prisma.guestLead.update({
      where: { id: guestLead.id },
      data: { quizAttemptsCount: { increment: 1 } },
    });

    return this.getAttemptForStudent(attempt.id);
  }

  async listGuestInProgress(guestSessionId: string) {
    return this.listInProgressAttempts({ guestSessionId });
  }

  async listStudentInProgress(studentId: string) {
    return this.listInProgressAttempts({ studentId });
  }

  async listInProgressAttempts(opts: {
    guestSessionId?: string;
    studentId?: string;
  }) {
    const or: Array<{ studentId: string } | { guestLeadId: string }> = [];
    if (opts.studentId) {
      or.push({ studentId: opts.studentId });
    }
    if (opts.guestSessionId) {
      const guestLead = await this.prisma.guestLead.findUnique({
        where: { guestSessionId: opts.guestSessionId },
        select: { id: true },
      });
      if (guestLead) or.push({ guestLeadId: guestLead.id });
    }
    if (!or.length) return [];

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        status: AttemptStatus.In_Progress,
        OR: or,
      },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            course: { select: { id: true, title: true } },
            _count: { select: { quizQuestions: true } },
          },
        },
        responses: {
          where: {
            OR: [
              { selectedChoiceId: { not: null } },
              { textResponse: { not: null } },
            ],
          },
          select: { id: true, questionId: true, selectedChoiceId: true },
        },
      },
    });

    const seen = new Set<string>();
    return attempts
      .filter((attempt) => {
        if (seen.has(attempt.id)) return false;
        seen.add(attempt.id);
        return true;
      })
      .map((attempt) => ({
        id: attempt.id,
        quizId: attempt.quizId,
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        secondsRemaining: attempt.secondsRemaining,
        violationCount: attempt.violationCount,
        lastActivityAt: attempt.lastActivityAt,
        answeredCount: attempt.responses.length,
        totalQuestions: attempt.quiz._count.quizQuestions,
        isExpired: attempt.secondsRemaining <= 0,
        quiz: {
          id: attempt.quiz.id,
          title: attempt.quiz.title,
          description: attempt.quiz.description,
          durationMinutes: attempt.quiz.durationMinutes,
          course: attempt.quiz.course,
        },
      }));
  }

  async listGuestCompleted(guestSessionId: string) {
    return this.listCompletedAttempts({ guestSessionId });
  }

  async listStudentCompleted(studentId: string) {
    return this.listCompletedAttempts({ studentId });
  }

  async listCompletedAttempts(opts: {
    guestSessionId?: string;
    studentId?: string;
  }) {
    const or: Array<{ studentId: string } | { guestLeadId: string }> = [];
    if (opts.studentId) {
      or.push({ studentId: opts.studentId });
    }
    if (opts.guestSessionId) {
      const guestLead = await this.prisma.guestLead.findUnique({
        where: { guestSessionId: opts.guestSessionId },
        select: { id: true },
      });
      if (guestLead) or.push({ guestLeadId: guestLead.id });
    }
    if (!or.length) return [];

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
        OR: or,
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            passingScorePercentage: true,
            course: { select: { id: true, title: true } },
            _count: { select: { quizQuestions: true } },
          },
        },
        responses: {
          select: { id: true, isCorrect: true },
        },
      },
    });

    const seen = new Set<string>();
    return attempts
      .filter((attempt) => {
        if (seen.has(attempt.id)) return false;
        seen.add(attempt.id);
        return true;
      })
      .map((attempt) => {
        const correctCount = attempt.responses.filter((r) => r.isCorrect).length;
        return {
          id: attempt.id,
          quizId: attempt.quizId,
          status: attempt.status,
          resultToken: attempt.resultToken,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          finalScore: attempt.finalScore,
          isPassed: attempt.isPassed,
          correctCount,
          totalQuestions: attempt.quiz._count.quizQuestions,
          quiz: {
            id: attempt.quiz.id,
            title: attempt.quiz.title,
            description: attempt.quiz.description,
            durationMinutes: attempt.quiz.durationMinutes,
            passingScorePercentage: attempt.quiz.passingScorePercentage,
            course: attempt.quiz.course,
          },
        };
      });
  }

  async getGuestAttempt(attemptId: string, guestSessionId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { guestLead: true },
    });
    if (!attempt || !attempt.guestLead) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.guestLead.guestSessionId !== guestSessionId) {
      throw new BadRequestException('This attempt does not belong to your session.');
    }
    return this.getAttemptForStudent(attemptId);
  }

  async saveGuestProgress(
    attemptId: string,
    guestSessionId: string,
    responses: Array<{
      questionId: string;
      choiceId?: string;
      textResponse?: string;
      timeSpent: number;
    }>,
  ) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { guestLead: true },
    });
    if (!attempt || !attempt.guestLead) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.guestLead.guestSessionId !== guestSessionId) {
      throw new BadRequestException('This attempt does not belong to your session.');
    }
    if (attempt.status !== AttemptStatus.In_Progress) {
      throw new BadRequestException('This quiz attempt has already been finalized.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const res of responses) {
        if (!res.choiceId && !res.textResponse) continue;

        const link = await tx.quizQuestion.findUnique({
          where: {
            quizId_questionId: {
              quizId: attempt.quizId,
              questionId: res.questionId,
            },
          },
        });
        if (!link) {
          throw new BadRequestException(`Invalid question: ${res.questionId}`);
        }

        await tx.studentResponse.upsert({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: res.questionId,
            },
          },
          create: {
            attemptId,
            questionId: res.questionId,
            selectedChoiceId: res.choiceId ?? null,
            textResponse: res.textResponse ?? null,
            timeSpentSeconds: res.timeSpent,
            isCorrect: false,
          },
          update: {
            selectedChoiceId: res.choiceId ?? null,
            textResponse: res.textResponse ?? null,
            timeSpentSeconds: res.timeSpent,
          },
        });
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: { lastActivityAt: new Date() },
      });
    });

    const answered = await this.prisma.studentResponse.count({
      where: {
        attemptId,
        OR: [{ selectedChoiceId: { not: null } }, { textResponse: { not: null } }],
      },
    });

    return {
      ok: true,
      answeredCount: answered,
      lastActivityAt: new Date().toISOString(),
    };
  }

  async getAttemptByResultToken(resultToken: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { resultToken },
    });
    if (!attempt) throw new NotFoundException('Result not found');
    if (attempt.status === AttemptStatus.In_Progress) {
      throw new BadRequestException('This quiz has not been submitted yet.');
    }
    return this.getAttemptForStudent(attempt.id);
  }

  async createQuiz(dto: CreateQuizDto, userId: string) {
    const inline = dto.questions ?? [];
    const bankIds = dto.questionIds ?? [];
    if (inline.length === 0 && bankIds.length === 0) {
      throw new BadRequestException('Add at least one question or attach bank questions.');
    }

    if (dto.requiresUnlock && (dto.priceLkr == null || dto.priceLkr <= 0)) {
      throw new BadRequestException('Set a price in LKR when the quiz requires unlock.');
    }

    if (dto.moduleId) {
      const mod = await this.prisma.module.findFirst({
        where: { id: dto.moduleId, courseId: dto.courseId },
      });
      if (!mod) {
        throw new BadRequestException('Module not found for the selected course.');
      }
    }

    const createdQuizId = await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          courseId: dto.courseId,
          moduleId: dto.moduleId ?? undefined,
          title: toJson(dto.title),
          description: dto.description ? toJson(dto.description) : undefined,
          coverImageUrl: dto.coverImageUrl ?? undefined,
          durationMinutes: dto.durationMinutes,
          passingScorePercentage: dto.passingScorePercentage,
          maxAttempts: dto.maxAttempts ?? 1,
          shuffleQuestions: dto.shuffleQuestions ?? false,
          requiresUnlock: dto.requiresUnlock ?? false,
          priceLkr:
            dto.requiresUnlock && dto.priceLkr != null ? dto.priceLkr : null,
          status: dto.status ?? QuizStatus.Draft,
          createdById: userId,
        },
      });

      let sortOrder = 0;

      for (const question of inline) {
        const created = await tx.question.create({
          data: {
            questionText: toJson(question.questionText),
            type: question.type,
            points: question.points ?? 1,
            status:
              dto.status === QuizStatus.Published
                ? QuestionStatus.Published
                : QuestionStatus.Draft,
            createdById: userId,
            choices: {
              create: question.choices.map((choice) => ({
                choiceText: toJson(choice.choiceText),
                isCorrect: choice.isCorrect,
              })),
            },
          },
        });
        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            questionId: created.id,
            sortOrder: question.sortOrder ?? sortOrder,
          },
        });
        sortOrder += 1;
      }

      for (const questionId of bankIds) {
        const exists = await tx.question.findUnique({ where: { id: questionId } });
        if (!exists) {
          throw new BadRequestException(`Question not found: ${questionId}`);
        }
        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            questionId,
            sortOrder,
          },
        });
        sortOrder += 1;
      }

      return quiz.id;
    });

    return this.getQuizById(createdQuizId);
  }

  async updateQuiz(id: string, dto: UpdateQuizDto) {
    const existing = await this.prisma.quiz.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quiz not found');

    const nextRequires =
      dto.requiresUnlock !== undefined
        ? dto.requiresUnlock
        : existing.requiresUnlock;
    const nextPrice =
      dto.priceLkr !== undefined
        ? dto.priceLkr
        : existing.priceLkr != null
          ? Number(existing.priceLkr)
          : null;

    if (nextRequires && (nextPrice == null || nextPrice <= 0)) {
      throw new BadRequestException('Set a price in LKR when the quiz requires unlock.');
    }

    const courseId = dto.courseId ?? existing.courseId;
    if (dto.moduleId) {
      const mod = await this.prisma.module.findFirst({
        where: { id: dto.moduleId, courseId },
      });
      if (!mod) {
        throw new BadRequestException('Module not found for the selected course.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quiz.update({
        where: { id },
        data: {
          courseId: dto.courseId,
          moduleId:
            dto.moduleId === undefined
              ? undefined
              : dto.moduleId === null
                ? null
                : dto.moduleId,
          title: dto.title ? toJson(dto.title) : undefined,
          description: dto.description ? toJson(dto.description) : undefined,
          coverImageUrl:
            dto.coverImageUrl === undefined ? undefined : dto.coverImageUrl,
          durationMinutes: dto.durationMinutes,
          passingScorePercentage: dto.passingScorePercentage,
          maxAttempts: dto.maxAttempts,
          shuffleQuestions: dto.shuffleQuestions,
          requiresUnlock: dto.requiresUnlock,
          priceLkr:
            dto.requiresUnlock === false
              ? null
              : dto.priceLkr !== undefined
                ? dto.priceLkr
                : undefined,
          status: dto.status,
        },
      });

      if (dto.questionIds) {
        await tx.quizQuestion.deleteMany({ where: { quizId: id } });
        for (let i = 0; i < dto.questionIds.length; i += 1) {
          const questionId = dto.questionIds[i];
          const exists = await tx.question.findUnique({ where: { id: questionId } });
          if (!exists) {
            throw new BadRequestException(`Question not found: ${questionId}`);
          }
          await tx.quizQuestion.create({
            data: { quizId: id, questionId, sortOrder: i },
          });
        }
      }
    });

    return this.getQuizById(id);
  }

  async updateQuizStatus(id: string, status: QuizStatus) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.prisma.quiz.update({ where: { id }, data: { status } });
    return this.getQuizById(id);
  }

  /**
   * Hard-deletes only when there are no attempts; otherwise archives.
   */
  async deleteQuiz(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    if (quiz._count.attempts > 0) {
      await this.prisma.quiz.update({
        where: { id },
        data: { status: QuizStatus.Archived },
      });
      return {
        archived: true,
        message: 'Quiz has attempts and was archived instead of deleted.',
        quiz: await this.getQuizById(id),
      };
    }

    await this.prisma.quiz.delete({ where: { id } });
    return { deleted: true, id };
  }

  /**
   * Resume in-progress (with time left), or allow a new attempt when under maxAttempts.
   * Finalized = Submitted / Timed_Out, plus expired In_Progress (counts against the limit).
   */
  private async resolveRetakeEligibility(
    attempts: Array<{
      id: string;
      status: AttemptStatus;
      secondsRemaining: number;
    }>,
    maxAttempts: number,
  ): Promise<{ action: 'resume'; attemptId: string } | { action: 'create' } | { action: 'reject'; message: string }> {
    const active = attempts.find(
      (a) => a.status === AttemptStatus.In_Progress && a.secondsRemaining > 0,
    );
    if (active) {
      return { action: 'resume', attemptId: active.id };
    }

    const consumed = attempts.filter(
      (a) =>
        a.status === AttemptStatus.Submitted ||
        a.status === AttemptStatus.Timed_Out ||
        (a.status === AttemptStatus.In_Progress && a.secondsRemaining <= 0),
    ).length;

    if (consumed >= maxAttempts) {
      return {
        action: 'reject',
        message:
          maxAttempts <= 1
            ? 'You have already attempted this quiz.'
            : `You have used all ${maxAttempts} attempts for this quiz.`,
      };
    }

    return { action: 'create' };
  }

  async getMyAttempt(quizId: string, studentId: string) {
    return this.prisma.quizAttempt.findFirst({
      where: { quizId, studentId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async startAttempt(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== QuizStatus.Published) {
      throw new BadRequestException('This quiz is not currently available to take.');
    }

    await this.assertQuizUnlocked(quiz, { userId: studentId });

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, studentId },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, secondsRemaining: true },
    });

    const decision = await this.resolveRetakeEligibility(
      attempts,
      quiz.maxAttempts ?? 1,
    );

    if (decision.action === 'resume') {
      await this.prisma.quizAttempt.update({
        where: { id: decision.attemptId },
        data: { lastHeartbeatAt: new Date(), lastActivityAt: new Date() },
      });
      return this.getAttemptForStudent(decision.attemptId);
    }

    if (decision.action === 'reject') {
      throw new BadRequestException(decision.message);
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + quiz.durationMinutes);
    const secondsRemaining = quiz.durationMinutes * 60;
    const questionOrder = await this.resolveQuestionOrder(
      quizId,
      quiz.shuffleQuestions,
    );

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        studentId,
        resultToken: randomUUID(),
        expiresAt,
        secondsRemaining,
        violationCount: 0,
        lastHeartbeatAt: now,
        lastActivityAt: now,
        questionOrder: questionOrder ?? undefined,
        status: AttemptStatus.In_Progress,
      },
    });

    return this.getAttemptForStudent(attempt.id);
  }

  /**
   * Syncs resilient timer state. Short active gaps deduct time; long gaps
   * (connection loss) freeze secondsRemaining. Tab-switch pauses increment
   * violations and auto-submit once the limit is reached.
   */
  async processHeartbeat(
    attemptId: string,
    body: {
      status: 'active' | 'paused';
      secondsRemaining: number;
      violationCount: number;
    },
    opts?: { studentId?: string; guestSessionId?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findUnique({
        where: { id: attemptId },
        include: { guestLead: true },
      });

      if (!attempt || attempt.status !== AttemptStatus.In_Progress) {
        throw new BadRequestException('Quiz session is invalid or closed.');
      }

      if (opts?.studentId) {
        if (attempt.studentId !== opts.studentId) {
          throw new BadRequestException('This attempt does not belong to you.');
        }
      }

      if (opts?.guestSessionId) {
        if (
          !attempt.guestLead ||
          attempt.guestLead.guestSessionId !== opts.guestSessionId
        ) {
          throw new BadRequestException(
            'This attempt does not belong to your session.',
          );
        }
      }

      const now = new Date();
      const lastHeartbeat = attempt.lastHeartbeatAt ?? attempt.lastActivityAt;
      const secondsElapsed = Math.max(
        0,
        Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000),
      );

      let verifiedSecondsRemaining = attempt.secondsRemaining;

      if (body.status === 'active') {
        if (secondsElapsed <= HEARTBEAT_ACTIVE_MAX_GAP_SECONDS) {
          verifiedSecondsRemaining = attempt.secondsRemaining - secondsElapsed;
        }
        // Else: connection was lost — keep frozen pool from last heartbeat.
      }
      // paused: freeze remaining time (no deduction for focus-loss gap)

      // Never trust the client to increase remaining time.
      verifiedSecondsRemaining = Math.min(
        verifiedSecondsRemaining,
        Math.max(0, body.secondsRemaining),
      );
      verifiedSecondsRemaining = Math.max(0, verifiedSecondsRemaining);

      let violationCount = Math.max(
        attempt.violationCount,
        body.violationCount,
      );
      // If client paused without bumping its counter, bump server-side.
      if (
        body.status === 'paused' &&
        violationCount === attempt.violationCount
      ) {
        violationCount += 1;
      }

      if (violationCount >= MAX_TAB_VIOLATIONS) {
        await tx.quizAttempt.update({
          where: { id: attemptId },
          data: {
            secondsRemaining: verifiedSecondsRemaining,
            violationCount,
            lastHeartbeatAt: now,
            lastActivityAt: now,
          },
        });
        return {
          autoSubmit: true,
          reason: 'violations' as const,
          serverSecondsRemaining: verifiedSecondsRemaining,
          violationCount,
        };
      }

      if (verifiedSecondsRemaining <= 0) {
        await tx.quizAttempt.update({
          where: { id: attemptId },
          data: {
            secondsRemaining: 0,
            violationCount,
            lastHeartbeatAt: now,
            lastActivityAt: now,
          },
        });
        return {
          autoSubmit: true,
          reason: 'timeout' as const,
          serverSecondsRemaining: 0,
          violationCount,
        };
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          secondsRemaining: verifiedSecondsRemaining,
          violationCount,
          lastHeartbeatAt: now,
          lastActivityAt: now,
        },
      });

      return {
        autoSubmit: false,
        reason: null,
        serverSecondsRemaining: verifiedSecondsRemaining,
        violationCount,
      };
    });
  }

  async getAttemptForStudent(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { responses: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const revealAnswers = attempt.status !== AttemptStatus.In_Progress;

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: attempt.quizId },
      include: {
        course: true,
        quizQuestions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              select: questionSelect(revealAnswers),
            },
          },
        },
      },
    });

    if (!quiz) throw new NotFoundException('Quiz not found');

    const mapped = this.mapQuizWithQuestions(quiz, { revealAnswers });
    const order = attempt.questionOrder as string[] | null;
    if (order?.length) {
      const byId = new Map(mapped.questions.map((q) => [q.id, q]));
      mapped.questions = order
        .map((id, index) => {
          const q = byId.get(id);
          return q ? { ...q, sortOrder: index } : null;
        })
        .filter(Boolean) as typeof mapped.questions;
    }

    return { ...attempt, quiz: mapped };
  }
}
