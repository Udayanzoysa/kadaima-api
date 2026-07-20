import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import {
  AttemptStatus,
  ContentLanguage,
  QuestionStatus,
  QuestionType,
  QuizStatus,
  Prisma,
  TeacherQuizVisibility,
} from '@prisma/client';
import { publicQuestionConfig } from '../question/question-config';
import {
  isSpecialPricedQuiz,
  mergeBilling,
  type PaymentMode,
} from '../settings/notification-config.types';
import {
  asLocalized,
  jsonDownload,
  parseJsonBuffer,
  readWorkbook,
  sheetToRows,
  xlsxDownload,
  type Localized as BackupLocalized,
} from '../common/backup/backup.util';

type Localized = { en: string; si: string; ta: string };

type ExportQuizQuestion = {
  questionText: BackupLocalized;
  type: QuestionType;
  points: number;
  status: QuestionStatus;
  imageUrl?: string | null;
  config?: Record<string, unknown>;
  choices: Array<{
    choiceText: BackupLocalized;
    isCorrect: boolean;
    imageUrl?: string | null;
  }>;
};

type ExportQuiz = {
  courseTitle: BackupLocalized;
  moduleTitle?: BackupLocalized | null;
  languages: ContentLanguage[];
  title: BackupLocalized;
  description?: BackupLocalized | null;
  coverImageUrl?: string | null;
  durationMinutes: number;
  passingScorePercentage: number;
  maxAttempts: number;
  shuffleQuestions: boolean;
  requiresUnlock: boolean;
  priceLkr?: number | null;
  status: QuizStatus;
  questions: ExportQuizQuestion[];
  sections?: Array<{
    instruction: BackupLocalized;
    questions: ExportQuizQuestion[];
  }>;
};

function toJson(value: Localized): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function plainText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localeText(text: unknown, language: ContentLanguage): string {
  if (!text || typeof text !== 'object') return '';
  const record = text as Partial<Localized>;
  return plainText(record[language]);
}

const ALL_LANGS: ContentLanguage[] = [
  ContentLanguage.en,
  ContentLanguage.si,
  ContentLanguage.ta,
];

function normalizeLanguages(
  languages?: ContentLanguage[] | null,
  fallback?: ContentLanguage | null,
): ContentLanguage[] {
  const raw =
    languages && languages.length > 0
      ? languages
      : fallback
        ? [fallback]
        : [ContentLanguage.en];
  const unique = ALL_LANGS.filter((l) => raw.includes(l));
  if (!unique.length) {
    throw new BadRequestException(
      'Select at least one quiz language (English, Sinhala, or Tamil).',
    );
  }
  return unique;
}

/** Keep only the selected quiz languages filled. */
function toLanguagesLocalized(
  text: Localized,
  languages: ContentLanguage[],
): Localized {
  const set = new Set(languages);
  return {
    en: set.has(ContentLanguage.en) ? text.en ?? '' : '',
    si: set.has(ContentLanguage.si) ? text.si ?? '' : '',
    ta: set.has(ContentLanguage.ta) ? text.ta ?? '' : '',
  };
}

function assertLocaleContent(
  text: unknown,
  language: ContentLanguage,
  label: string,
  minLen = 1,
) {
  const value = localeText(text, language);
  if (value.length < minLen) {
    throw new BadRequestException(
      `${label} must be provided in ${language.toUpperCase()}.`,
    );
  }
}

function assertLanguagesContent(
  text: unknown,
  languages: ContentLanguage[],
  label: string,
  minLen = 1,
) {
  for (const language of languages) {
    assertLocaleContent(text, language, label, minLen);
  }
}

async function assertQuestionsMatchLanguages(
  tx: Prisma.TransactionClient,
  questionIds: string[],
  languages: ContentLanguage[],
) {
  for (const questionId of questionIds) {
    const question = await tx.question.findUnique({
      where: { id: questionId },
      include: { choices: true },
    });
    if (!question) {
      throw new BadRequestException(`Question not found: ${questionId}`);
    }
    assertLanguagesContent(question.questionText, languages, 'Question text', 3);
    if (question.type === 'MCQ' || question.type === 'SEQUENCE') {
      for (const choice of question.choices) {
        // Image-only choices are allowed; otherwise require text in every quiz language.
        if (choice.imageUrl) continue;
        assertLanguagesContent(choice.choiceText, languages, 'Answer choice', 1);
      }
    }
  }
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
      imageUrl: true,
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

  private mapQuizListItem<
    T extends {
      priceLkr: Prisma.Decimal | number | null;
      _count: { quizQuestions: number; attempts: number };
    },
  >(q: T) {
    return {
      ...q,
      priceLkr: q.priceLkr != null ? Number(q.priceLkr) : null,
      _count: {
        questions: q._count.quizQuestions,
        attempts: q._count.attempts,
      },
    };
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
    return quizzes.map((q) => this.mapQuizListItem(q));
  }

  async listQuizzesPaginated(opts: {
    status?: QuizStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
    const where = opts.status ? { status: opts.status } : undefined;

    const [total, quizzes] = await Promise.all([
      this.prisma.quiz.count({ where }),
      this.prisma.quiz.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          course: true,
          module: { select: { id: true, title: true } },
          createdBy: { select: { id: true, email: true, name: true } },
          _count: { select: { quizQuestions: true, attempts: true } },
        },
      }),
    ]);

    return {
      items: quizzes.map((q) => this.mapQuizListItem(q)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkUpdateStatus(ids: string[], status: QuizStatus) {
    if (!ids.length) throw new BadRequestException('No quiz IDs provided');
    const result = await this.prisma.quiz.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: result.count, status };
  }

  async bulkDelete(ids: string[]) {
    if (!ids.length) throw new BadRequestException('No quiz IDs provided');

    const quizzes = await this.prisma.quiz.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { attempts: true } } },
    });

    let deleted = 0;
    let archived = 0;

    for (const quiz of quizzes) {
      if (quiz._count.attempts > 0) {
        await this.prisma.quiz.update({
          where: { id: quiz.id },
          data: { status: QuizStatus.Archived },
        });
        archived += 1;
      } else {
        await this.prisma.quiz.delete({ where: { id: quiz.id } });
        deleted += 1;
      }
    }

    return { deleted, archived, total: quizzes.length };
  }

  /** Shape quizQuestions into a flat `questions` array + optional `sections` for API consumers. */
  private mapQuizWithQuestions<
    T extends {
      quizQuestions: Array<{
        sortOrder: number;
        sectionId?: string | null;
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
      sections?: Array<{
        id: string;
        instruction: unknown;
        sortOrder: number;
      }>;
    },
  >(quiz: T, opts?: { revealAnswers?: boolean }) {
    const reveal = opts?.revealAnswers ?? true;
    const { quizQuestions, sections: sectionRows, ...rest } = quiz;
    const questions = [...quizQuestions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => ({
        ...link.question,
        config: reveal
          ? link.question.config ?? {}
          : publicQuestionConfig(link.question.config),
        sortOrder: link.sortOrder,
        sectionId: link.sectionId ?? null,
      }));

    const sections = [...(sectionRows ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({
        id: section.id,
        instruction: section.instruction,
        sortOrder: section.sortOrder,
        questions: questions.filter((q) => q.sectionId === section.id),
      }));

    return {
      ...rest,
      questions,
      sections,
      _count: { questions: questions.length },
    };
  }

  private quizDetailInclude(revealAnswers: boolean) {
    return {
      course: true,
      module: { select: { id: true, title: true, courseId: true } },
      sections: { orderBy: { sortOrder: 'asc' as const } },
      quizQuestions: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          question: revealAnswers
            ? { include: { choices: true } }
            : { select: questionSelect(false) },
        },
      },
      _count: { select: { attempts: true } },
    };
  }

  async getQuizById(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: this.quizDetailInclude(true),
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    const mapped = this.mapQuizWithQuestions(quiz);
    return {
      ...mapped,
      priceLkr: quiz.priceLkr != null ? Number(quiz.priceLkr) : null,
    };
  }

  /** Public catalog — published quizzes only, no question content. */
  /** Flatten localized JSON title for case-insensitive contains search. */
  private localizedSearchBlob(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value.toLowerCase();
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>;
      return [o.en, o.si, o.ta]
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase();
    }
    return '';
  }

  /**
   * Searchable catalog index for the public home sidebar.
   * Courses + modules with quiz counts and pre-normalized search text (en/si/ta).
   */
  async getPublishedCatalogIndex() {
    const quizzes = await this.prisma.quiz.findMany({
      where: { status: QuizStatus.Published },
      select: {
        course: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
      },
    });

    type ModAcc = {
      id: string;
      title: unknown;
      quizCount: number;
      searchText: string;
    };
    type CourseAcc = {
      id: string;
      title: unknown;
      quizCount: number;
      searchText: string;
      modules: Map<string, ModAcc>;
    };

    const courses = new Map<string, CourseAcc>();

    for (const q of quizzes) {
      let course = courses.get(q.course.id);
      if (!course) {
        course = {
          id: q.course.id,
          title: q.course.title,
          quizCount: 0,
          searchText: this.localizedSearchBlob(q.course.title),
          modules: new Map(),
        };
        courses.set(q.course.id, course);
      }
      course.quizCount += 1;

      if (q.module?.id) {
        let mod = course.modules.get(q.module.id);
        if (!mod) {
          mod = {
            id: q.module.id,
            title: q.module.title,
            quizCount: 0,
            searchText: this.localizedSearchBlob(q.module.title),
          };
          course.modules.set(q.module.id, mod);
        }
        mod.quizCount += 1;
      }
    }

    const courseList = Array.from(courses.values()).map((c) => ({
      id: c.id,
      title: c.title,
      quizCount: c.quizCount,
      searchText: c.searchText,
      modules: Array.from(c.modules.values()).map((m) => ({
        id: m.id,
        title: m.title,
        quizCount: m.quizCount,
        searchText: m.searchText,
      })),
    }));

    /** Flat entries for client-side indexed search (course + module names). */
    const entries: Array<{
      type: 'course' | 'module';
      id: string;
      courseId: string;
      moduleId?: string;
      title: unknown;
      quizCount: number;
      searchText: string;
    }> = [];

    for (const c of courseList) {
      entries.push({
        type: 'course',
        id: c.id,
        courseId: c.id,
        title: c.title,
        quizCount: c.quizCount,
        searchText: c.searchText,
      });
      for (const m of c.modules) {
        entries.push({
          type: 'module',
          id: m.id,
          courseId: c.id,
          moduleId: m.id,
          title: m.title,
          quizCount: m.quizCount,
          searchText: `${c.searchText} ${m.searchText}`.trim(),
        });
      }
    }

    return { courses: courseList, entries };
  }

  async listPublishedQuizzes(
    guestSessionId?: string,
    userId?: string,
    teacherSlug?: string,
    filters?: { courseId?: string; moduleId?: string; q?: string },
  ) {
    const slug = teacherSlug?.trim().toLowerCase();
    let teacherQuizFilter: { id?: { in: string[] } } = {};

    if (slug) {
      const profile = await this.prisma.teacherProfile.findFirst({
        where: { slug, isPublic: true },
        select: {
          quizVisibility: true,
          selectedQuizzes: { select: { quizId: true } },
        },
      });
      if (!profile) {
        return [];
      }
      if (profile.quizVisibility === TeacherQuizVisibility.SELECTED) {
        const ids = profile.selectedQuizzes.map((r) => r.quizId);
        if (!ids.length) return [];
        teacherQuizFilter = { id: { in: ids } };
      }
    }

    const courseId = filters?.courseId?.trim();
    const moduleId = filters?.moduleId?.trim();
    const q = filters?.q?.trim().toLowerCase();

    const quizzes = await this.prisma.quiz.findMany({
      where: {
        status: QuizStatus.Published,
        ...teacherQuizFilter,
        ...(slug
          ? {
              createdBy: {
                teacherProfile: { slug, isPublic: true },
              },
            }
          : {}),
        ...(courseId ? { courseId } : {}),
        ...(moduleId ? { moduleId } : {}),
      },
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
        createdBy: {
          select: {
            id: true,
            name: true,
            teacherProfile: { select: { slug: true, displayName: true } },
          },
        },
        _count: { select: { quizQuestions: true, attempts: true } },
      },
    });

    const filtered = q
      ? quizzes.filter((quiz) => {
          const blob = [
            this.localizedSearchBlob(quiz.title),
            this.localizedSearchBlob(quiz.course.title),
            this.localizedSearchBlob(quiz.module?.title),
          ].join(' ');
          return blob.includes(q);
        })
      : quizzes;

    const unlockedIds = new Set<string>();
    const quizIds = filtered.map((quiz) => quiz.id);
    const paymentMode = await this.getPaymentMode();
    const hasSub = userId ? await this.hasActiveSubscription(userId) : false;

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

    return filtered.map((quiz) => {
      const priceLkr = quiz.priceLkr != null ? Number(quiz.priceLkr) : null;
      return {
        ...quiz,
        priceLkr,
        unlocked: quiz.requiresUnlock
          ? this.resolveUnlocked({
              paymentMode,
              hasSub,
              hasDirectUnlock: unlockedIds.has(quiz.id),
              priceLkr,
            })
          : true,
        _count: {
          questions: quiz._count.quizQuestions,
          attempts: quiz._count.attempts,
        },
      };
    });
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

  async hasActiveSubscription(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(sub);
  }

  private async getPaymentMode(): Promise<PaymentMode> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: 'default' },
      select: { billing: true },
    });
    return mergeBilling(row?.billing).paymentMode;
  }

  /** Whether subscription / direct unlock grants access for this lock + price. */
  private resolveUnlocked(params: {
    paymentMode: PaymentMode;
    hasSub: boolean;
    hasDirectUnlock: boolean;
    priceLkr: number | null;
  }): boolean {
    if (params.hasDirectUnlock) return true;
    if (params.paymentMode === 'QUIZ_ONLY') return false;
    if (params.paymentMode === 'MONTHLY_ONLY') return params.hasSub;
    // MIXED: monthly covers unpriced locks; priced quizzes need direct unlock
    if (isSpecialPricedQuiz(params.priceLkr)) return false;
    return params.hasSub;
  }

  async isQuizUnlocked(
    quizId: string,
    opts: { guestSessionId?: string; userId?: string },
  ): Promise<boolean> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { requiresUnlock: true, priceLkr: true },
    });
    if (!quiz) return false;
    if (!quiz.requiresUnlock) return true;

    let hasDirectUnlock = false;
    if (opts.guestSessionId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, guestSessionId: opts.guestSessionId },
        select: { id: true },
      });
      if (row) hasDirectUnlock = true;
    }
    if (!hasDirectUnlock && opts.userId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, userId: opts.userId },
        select: { id: true },
      });
      if (row) hasDirectUnlock = true;
    }

    const paymentMode = await this.getPaymentMode();
    const hasSub = await this.hasActiveSubscription(opts.userId);
    const priceLkr = quiz.priceLkr != null ? Number(quiz.priceLkr) : null;

    return this.resolveUnlocked({
      paymentMode,
      hasSub,
      hasDirectUnlock,
      priceLkr,
    });
  }

  private async assertQuizUnlocked(
    quiz: { id: string; requiresUnlock: boolean },
    opts: { guestSessionId?: string; userId?: string },
  ) {
    if (!quiz.requiresUnlock) return;
    const unlocked = await this.isQuizUnlocked(quiz.id, opts);
    if (!unlocked) {
      throw new ForbiddenException(
        'This quiz is locked. Unlock it via the available payment option before you can attempt it.',
      );
    }
  }

  private async assertUnlockPricing(
    requiresUnlock: boolean,
    priceLkr?: number | null,
  ) {
    if (!requiresUnlock) return;
    const mode = await this.getPaymentMode();
    if (mode === 'QUIZ_ONLY' && !isSpecialPricedQuiz(priceLkr)) {
      throw new BadRequestException(
        'Per-quiz payment mode requires a Price (LKR) greater than 0 for locked quizzes.',
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
        sections: { orderBy: { sortOrder: 'asc' } },
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

  /**
   * When shuffle is on, shuffle within each section (and within ungrouped),
   * keeping section order fixed. Returns null when shuffle is off (use DB sortOrder).
   */
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
      select: { questionId: true, sectionId: true },
    });
    if (!links.length) return [];
    if (!shuffle) return null;

    const sections = await this.prisma.quizSection.findMany({
      where: { quizId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    const ordered: string[] = [];
    const ungrouped = links.filter((l) => !l.sectionId).map((l) => l.questionId);
    if (ungrouped.length) {
      ordered.push(...shuffleIds(ungrouped));
    }
    for (const section of sections) {
      const ids = links
        .filter((l) => l.sectionId === section.id)
        .map((l) => l.questionId);
      if (ids.length) ordered.push(...shuffleIds(ids));
    }
    return ordered;
  }

  /** Replace quiz sections + question links from a sections payload. */
  private async replaceQuizSections(
    tx: Prisma.TransactionClient,
    quizId: string,
    sections: Array<{ instruction: Localized; questionIds: string[] }>,
    languages: ContentLanguage[],
  ) {
    if (sections.length === 0) {
      throw new BadRequestException('Add at least one instruction section with questions.');
    }

    const allIds: string[] = [];
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      assertLanguagesContent(
        section.instruction,
        languages,
        `Section ${i + 1} instruction`,
        1,
      );
      if (!section.questionIds?.length) {
        throw new BadRequestException(
          `Section ${i + 1} must include at least one question.`,
        );
      }
      allIds.push(...section.questionIds);
    }

    const unique = new Set(allIds);
    if (unique.size !== allIds.length) {
      throw new BadRequestException('Each question may only appear in one section.');
    }

    await assertQuestionsMatchLanguages(tx, allIds, languages);

    await tx.quizQuestion.deleteMany({ where: { quizId } });
    await tx.quizSection.deleteMany({ where: { quizId } });

    let sortOrder = 0;
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      const created = await tx.quizSection.create({
        data: {
          quizId,
          instruction: toJson(toLanguagesLocalized(section.instruction, languages)),
          sortOrder: i,
        },
      });
      for (const questionId of section.questionIds) {
        await tx.quizQuestion.create({
          data: {
            quizId,
            questionId,
            sectionId: created.id,
            sortOrder,
          },
        });
        sortOrder += 1;
      }
    }
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
      userId?: string;
    },
  ) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== QuizStatus.Published) {
      throw new BadRequestException('This quiz is not currently available to take.');
    }

    await this.assertQuizUnlocked(quiz, {
      guestSessionId: lead.guestSessionId,
      userId: lead.userId,
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
    const useSections = Array.isArray(dto.sections) && dto.sections.length > 0;
    const bankIds = useSections
      ? dto.sections!.flatMap((s) => s.questionIds)
      : (dto.questionIds ?? []);
    if (inline.length === 0 && bankIds.length === 0) {
      throw new BadRequestException('Add at least one question or attach bank questions.');
    }

    const languages = normalizeLanguages(
      dto.languages,
      dto.language ?? ContentLanguage.en,
    );
    const language = languages[0];
    assertLanguagesContent(dto.title, languages, 'Quiz title', 3);
    if (dto.description) {
      assertLanguagesContent(dto.description, languages, 'Quiz description', 10);
    }

    for (const question of inline) {
      assertLanguagesContent(question.questionText, languages, 'Question text', 3);
      for (const choice of question.choices ?? []) {
        if (choice.imageUrl) continue;
        assertLanguagesContent(choice.choiceText, languages, 'Answer choice', 1);
      }
    }

    await this.assertUnlockPricing(dto.requiresUnlock ?? false, dto.priceLkr);

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
          language,
          languages,
          title: toJson(toLanguagesLocalized(dto.title, languages)),
          description: dto.description
            ? toJson(toLanguagesLocalized(dto.description, languages))
            : undefined,
          coverImageUrl: dto.coverImageUrl ?? undefined,
          durationMinutes: dto.durationMinutes,
          passingScorePercentage: dto.passingScorePercentage,
          maxAttempts: dto.maxAttempts ?? 1,
          shuffleQuestions: dto.shuffleQuestions ?? false,
          requiresUnlock: dto.requiresUnlock ?? false,
          priceLkr: dto.priceLkr != null ? dto.priceLkr : null,
          status: dto.status ?? QuizStatus.Draft,
          createdById: userId,
        },
      });

      if (useSections) {
        await this.replaceQuizSections(tx, quiz.id, dto.sections!, languages);
        return quiz.id;
      }

      if (bankIds.length > 0) {
        await assertQuestionsMatchLanguages(tx, bankIds, languages);
      }

      let sortOrder = 0;

      for (const question of inline) {
        const created = await tx.question.create({
          data: {
            questionText: toJson(
              toLanguagesLocalized(question.questionText, languages),
            ),
            type: question.type,
            points: question.points ?? 1,
            status:
              dto.status === QuizStatus.Published
                ? QuestionStatus.Published
                : QuestionStatus.Draft,
            createdById: userId,
            choices: {
              create: (question.choices ?? []).map((choice) => ({
                choiceText: toJson(
                  toLanguagesLocalized(choice.choiceText, languages),
                ),
                imageUrl: choice.imageUrl ?? null,
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

    const languages = normalizeLanguages(
      dto.languages ??
        (dto.language !== undefined ? [dto.language] : undefined) ??
        existing.languages,
      dto.language ?? existing.language,
    );
    const language = languages[0];

    if (dto.title) {
      assertLanguagesContent(dto.title, languages, 'Quiz title', 3);
    }
    if (dto.description) {
      assertLanguagesContent(dto.description, languages, 'Quiz description', 10);
    }

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

    await this.assertUnlockPricing(nextRequires, nextPrice);

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
      const prevLanguages = normalizeLanguages(
        existing.languages,
        existing.language,
      );
      const languagesChanged =
        languages.length !== prevLanguages.length ||
        languages.some((l, i) => l !== prevLanguages[i]);
      const sectionsChanging = dto.sections !== undefined;
      const questionsChanging = dto.questionIds !== undefined || sectionsChanging;

      if (languagesChanged || questionsChanging) {
        const questionIds = sectionsChanging
          ? (dto.sections ?? []).flatMap((s) => s.questionIds)
          : dto.questionIds ??
            (
              await tx.quizQuestion.findMany({
                where: { quizId: id },
                orderBy: { sortOrder: 'asc' },
                select: { questionId: true },
              })
            ).map((link) => link.questionId);

        if (questionIds.length > 0 && !sectionsChanging) {
          await assertQuestionsMatchLanguages(tx, questionIds, languages);
        }
      }

      const nextTitle = dto.title
        ? toLanguagesLocalized(dto.title, languages)
        : languagesChanged
          ? toLanguagesLocalized(existing.title as Localized, languages)
          : undefined;
      const nextDescription = dto.description
        ? toLanguagesLocalized(dto.description, languages)
        : languagesChanged && existing.description
          ? toLanguagesLocalized(existing.description as Localized, languages)
          : undefined;

      if (nextTitle) {
        assertLanguagesContent(nextTitle, languages, 'Quiz title', 3);
      }
      if (nextDescription) {
        assertLanguagesContent(nextDescription, languages, 'Quiz description', 10);
      }

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
          language,
          languages,
          title: nextTitle ? toJson(nextTitle) : undefined,
          description:
            nextDescription !== undefined ? toJson(nextDescription) : undefined,
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

      if (dto.sections !== undefined) {
        await this.replaceQuizSections(tx, id, dto.sections, languages);
      } else if (dto.questionIds) {
        await tx.quizQuestion.deleteMany({ where: { quizId: id } });
        await tx.quizSection.deleteMany({ where: { quizId: id } });
        for (let i = 0; i < dto.questionIds.length; i += 1) {
          const questionId = dto.questionIds[i];
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
        sections: { orderBy: { sortOrder: 'asc' } },
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

      if (mapped.sections?.length) {
        mapped.sections = mapped.sections.map((section) => ({
          ...section,
          questions: mapped.questions.filter((q) => q.sectionId === section.id),
        }));
      }
    }

    return { ...attempt, quiz: mapped };
  }

  private toExportQuestion(question: {
    questionText: unknown;
    type: QuestionType;
    points: number;
    status?: QuestionStatus;
    imageUrl?: string | null;
    config?: unknown;
    choices: Array<{
      choiceText: unknown;
      isCorrect: boolean;
      imageUrl?: string | null;
    }>;
  }): ExportQuizQuestion {
    return {
      questionText: asLocalized(question.questionText),
      type: question.type,
      points: question.points,
      status: question.status ?? QuestionStatus.Draft,
      imageUrl: question.imageUrl ?? null,
      config:
        question.config && typeof question.config === 'object'
          ? (question.config as Record<string, unknown>)
          : {},
      choices: (question.choices ?? []).map((c) => ({
        choiceText: asLocalized(c.choiceText),
        isCorrect: Boolean(c.isCorrect),
        imageUrl: c.imageUrl ?? null,
      })),
    };
  }

  private titleKey(title: unknown): string {
    return asLocalized(title).en.trim().toLowerCase();
  }

  private async resolveCourseIdByTitle(title: BackupLocalized): Promise<string> {
    const key = title.en.trim().toLowerCase();
    if (!key) throw new BadRequestException('courseTitle.en is required');
    const courses = await this.prisma.course.findMany({
      select: { id: true, title: true },
    });
    const match = courses.find((c) => this.titleKey(c.title) === key);
    if (!match) {
      throw new BadRequestException(
        `Course not found for title "${title.en}". Import or create the course first.`,
      );
    }
    return match.id;
  }

  private async resolveModuleIdByTitle(
    courseId: string,
    title?: BackupLocalized | null,
  ): Promise<string | null> {
    if (!title?.en?.trim()) return null;
    const key = title.en.trim().toLowerCase();
    const modules = await this.prisma.module.findMany({
      where: { courseId },
      select: { id: true, title: true },
    });
    const match = modules.find((m) => this.titleKey(m.title) === key);
    if (!match) {
      throw new BadRequestException(
        `Module not found for title "${title.en}" under the selected course.`,
      );
    }
    return match.id;
  }

  async exportBackup(format: 'json' | 'xlsx' = 'json') {
    const rows = await this.prisma.quiz.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        course: { select: { title: true } },
        module: { select: { title: true } },
        sections: { orderBy: { sortOrder: 'asc' } },
        quizQuestions: {
          orderBy: { sortOrder: 'asc' },
          include: { question: { include: { choices: true } } },
        },
      },
    });

    const payload: ExportQuiz[] = rows.map((quiz) => {
      const flatQuestions = [...quiz.quizQuestions]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((link) => this.toExportQuestion(link.question));

      const sections =
        quiz.sections.length > 0
          ? quiz.sections.map((section) => ({
              instruction: asLocalized(section.instruction),
              questions: quiz.quizQuestions
                .filter((link) => link.sectionId === section.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((link) => this.toExportQuestion(link.question)),
            }))
          : undefined;

      return {
        courseTitle: asLocalized(quiz.course.title),
        moduleTitle: quiz.module ? asLocalized(quiz.module.title) : null,
        languages: (quiz.languages?.length
          ? quiz.languages
          : [quiz.language]) as ContentLanguage[],
        title: asLocalized(quiz.title),
        description: quiz.description ? asLocalized(quiz.description) : null,
        coverImageUrl: quiz.coverImageUrl,
        durationMinutes: quiz.durationMinutes,
        passingScorePercentage: quiz.passingScorePercentage,
        maxAttempts: quiz.maxAttempts,
        shuffleQuestions: quiz.shuffleQuestions,
        requiresUnlock: quiz.requiresUnlock,
        priceLkr: quiz.priceLkr != null ? Number(quiz.priceLkr) : null,
        status: quiz.status,
        questions: flatQuestions,
        sections,
      };
    });

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const quizRows = payload.map((q, index) => ({
        quiz_index: index + 1,
        course_title_en: q.courseTitle.en,
        course_title_si: q.courseTitle.si,
        course_title_ta: q.courseTitle.ta,
        module_title_en: q.moduleTitle?.en ?? '',
        module_title_si: q.moduleTitle?.si ?? '',
        module_title_ta: q.moduleTitle?.ta ?? '',
        title_en: q.title.en,
        title_si: q.title.si,
        title_ta: q.title.ta,
        description_en: q.description?.en ?? '',
        description_si: q.description?.si ?? '',
        description_ta: q.description?.ta ?? '',
        languages: q.languages.join(','),
        duration_minutes: q.durationMinutes,
        passing_score: q.passingScorePercentage,
        max_attempts: q.maxAttempts,
        shuffle_questions: q.shuffleQuestions ? 'true' : 'false',
        requires_unlock: q.requiresUnlock ? 'true' : 'false',
        price_lkr: q.priceLkr ?? '',
        status: q.status,
        cover_image_url: q.coverImageUrl ?? '',
      }));

      const questionRows = payload.flatMap((q, index) =>
        q.questions.map((question, qi) => {
          const row: Record<string, string | number> = {
            quiz_index: index + 1,
            question_index: qi + 1,
            question_en: question.questionText.en,
            question_si: question.questionText.si,
            question_ta: question.questionText.ta,
            type: question.type,
            points: question.points,
            status: question.status,
            correct: '',
          };
          const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
          letters.forEach((letter, i) => {
            const choice = question.choices[i];
            row[`option_${letter}`] = choice?.choiceText.en ?? '';
            row[`option_${letter}_si`] = choice?.choiceText.si ?? '';
            row[`option_${letter}_ta`] = choice?.choiceText.ta ?? '';
          });
          if (question.type === QuestionType.MCQ) {
            const correctIndex = question.choices.findIndex((c) => c.isCorrect);
            if (correctIndex >= 0 && correctIndex < letters.length) {
              row.correct = letters[correctIndex].toUpperCase();
            }
          }
          return row;
        }),
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(quizRows),
        'Quizzes',
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(questionRows),
        'Questions',
      );
      return xlsxDownload(workbook, `quizzes-backup-${stamp}.xlsx`);
    }

    return jsonDownload(
      {
        version: 1,
        type: 'quizzes',
        exportedAt: new Date().toISOString(),
        count: payload.length,
        quizzes: payload,
      },
      `quizzes-backup-${stamp}.json`,
    );
  }

  private parseImportQuizzes(raw: unknown): ExportQuiz[] {
    if (Array.isArray(raw)) return raw as ExportQuiz[];
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.quizzes)) return obj.quizzes as ExportQuiz[];
    }
    throw new BadRequestException(
      'Invalid backup file. Expected { type: "quizzes", quizzes: [...] } or an array.',
    );
  }

  private parseQuizzesFromExcel(buffer: Buffer): ExportQuiz[] {
    const workbook = readWorkbook(buffer);
    const quizSheet =
      workbook.Sheets.Quizzes || workbook.Sheets[workbook.SheetNames[0]];
    if (!quizSheet) throw new BadRequestException('Excel file has no Quizzes sheet');
    const quizRows = sheetToRows(quizSheet);
    const questionSheet = workbook.Sheets.Questions;
    const questionRows = questionSheet ? sheetToRows(questionSheet) : [];

    return quizRows.map((row, i) => {
      const quizIndex = Number(row.quiz_index) || i + 1;
      const title = asLocalized({
        en: row.title_en || row.title || '',
        si: row.title_si || '',
        ta: row.title_ta || '',
      });
      if (!title.en.trim()) {
        throw new BadRequestException(`Quiz row ${i + 2}: title_en is required`);
      }

      const courseTitle = asLocalized({
        en: row.course_title_en || '',
        si: row.course_title_si || '',
        ta: row.course_title_ta || '',
      });
      if (!courseTitle.en.trim()) {
        throw new BadRequestException(`Quiz row ${i + 2}: course_title_en is required`);
      }

      const statusRaw = row.status || QuizStatus.Draft;
      if (!Object.values(QuizStatus).includes(statusRaw as QuizStatus)) {
        throw new BadRequestException(`Quiz row ${i + 2}: invalid status`);
      }

      const languages = (row.languages || 'en')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as ContentLanguage[];

      const questions = questionRows
        .filter((q) => Number(q.quiz_index) === quizIndex)
        .map((q, qi) => {
          const questionText = asLocalized({
            en: q.question_en || q.question || '',
            si: q.question_si || '',
            ta: q.question_ta || '',
          });
          if (!questionText.en.trim()) {
            throw new BadRequestException(
              `Question for quiz ${quizIndex} row ${qi + 2}: question_en is required`,
            );
          }
          const typeRaw = (q.type || 'MCQ').toUpperCase();
          if (!Object.values(QuestionType).includes(typeRaw as QuestionType)) {
            throw new BadRequestException(
              `Question for quiz ${quizIndex}: invalid type "${q.type}"`,
            );
          }
          const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
          const correctLetter = (q.correct || '').trim().toLowerCase();
          const choices = letters
            .map((letter) => {
              const en = q[`option_${letter}`] || '';
              if (!en.trim()) return null;
              return {
                choiceText: asLocalized({
                  en,
                  si: q[`option_${letter}_si`] || '',
                  ta: q[`option_${letter}_ta`] || '',
                }),
                isCorrect: correctLetter === letter,
              };
            })
            .filter(Boolean) as ExportQuizQuestion['choices'];

          return {
            questionText,
            type: typeRaw as QuestionType,
            points: Math.max(1, Number(q.points) || 1),
            status: (q.status as QuestionStatus) || QuestionStatus.Draft,
            imageUrl: null,
            config: {},
            choices,
          };
        });

      return {
        courseTitle,
        moduleTitle: row.module_title_en
          ? asLocalized({
              en: row.module_title_en,
              si: row.module_title_si || '',
              ta: row.module_title_ta || '',
            })
          : null,
        languages: languages.length ? languages : [ContentLanguage.en],
        title,
        description: asLocalized({
          en: row.description_en || '',
          si: row.description_si || '',
          ta: row.description_ta || '',
        }),
        coverImageUrl: row.cover_image_url || null,
        durationMinutes: Math.max(5, Number(row.duration_minutes) || 30),
        passingScorePercentage: Math.min(
          100,
          Math.max(1, Number(row.passing_score) || 70),
        ),
        maxAttempts: Math.max(1, Number(row.max_attempts) || 1),
        shuffleQuestions: String(row.shuffle_questions).toLowerCase() === 'true',
        requiresUnlock: String(row.requires_unlock).toLowerCase() === 'true',
        priceLkr: row.price_lkr ? Number(row.price_lkr) : null,
        status: statusRaw as QuizStatus,
        questions,
      };
    });
  }

  async importBackup(file: Express.Multer.File, userId: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Backup file is required');
    }

    const name = (file.originalname || '').toLowerCase();
    let items: ExportQuiz[] = [];

    if (name.endsWith('.json') || file.mimetype === 'application/json') {
      items = this.parseImportQuizzes(parseJsonBuffer(file.buffer));
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      items = this.parseQuizzesFromExcel(file.buffer);
    } else {
      throw new BadRequestException('Supported formats: .json, .xlsx');
    }

    if (!items.length) {
      throw new BadRequestException('No quizzes found in backup file');
    }

    let created = 0;
    const failures: string[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        const courseId = await this.resolveCourseIdByTitle(
          asLocalized(item.courseTitle),
        );
        const moduleId = await this.resolveModuleIdByTitle(
          courseId,
          item.moduleTitle ? asLocalized(item.moduleTitle) : null,
        );

        const languages = (item.languages?.length
          ? item.languages
          : [ContentLanguage.en]) as ContentLanguage[];

        const sectionPayload =
          Array.isArray(item.sections) && item.sections.length > 0
            ? item.sections
            : null;

        if (sectionPayload) {
          const sections: Array<{ instruction: Localized; questionIds: string[] }> =
            [];
          for (const section of sectionPayload) {
            const questionIds: string[] = [];
            for (const q of section.questions ?? []) {
              const createdQ = await this.prisma.question.create({
                data: {
                  questionText: toJson(asLocalized(q.questionText)),
                  type: q.type ?? QuestionType.MCQ,
                  points: q.points ?? 1,
                  status: q.status ?? QuestionStatus.Draft,
                  imageUrl: q.imageUrl ?? null,
                  config: (q.config ?? {}) as Prisma.InputJsonValue,
                  createdById: userId,
                  choices: {
                    create: (q.choices ?? []).map((c) => ({
                      choiceText: toJson(asLocalized(c.choiceText)),
                      isCorrect: Boolean(c.isCorrect),
                      imageUrl: c.imageUrl ?? null,
                    })),
                  },
                },
              });
              questionIds.push(createdQ.id);
            }
            if (!questionIds.length) {
              throw new BadRequestException('Section has no questions');
            }
            sections.push({
              instruction: asLocalized(section.instruction),
              questionIds,
            });
          }

          const dto: CreateQuizDto = {
            courseId,
            moduleId,
            languages,
            language: languages[0],
            title: asLocalized(item.title),
            description: item.description
              ? asLocalized(item.description)
              : undefined,
            coverImageUrl: item.coverImageUrl ?? null,
            durationMinutes: item.durationMinutes ?? 30,
            passingScorePercentage: item.passingScorePercentage ?? 70,
            maxAttempts: item.maxAttempts ?? 1,
            shuffleQuestions: Boolean(item.shuffleQuestions),
            requiresUnlock: Boolean(item.requiresUnlock),
            priceLkr: item.priceLkr ?? null,
            status: item.status ?? QuizStatus.Draft,
            sections,
          };
          await this.createQuiz(dto, userId);
        } else {
          const questions = item.questions ?? [];
          if (!questions.length) {
            throw new BadRequestException('Quiz has no questions');
          }
          const dto: CreateQuizDto = {
            courseId,
            moduleId,
            languages,
            language: languages[0],
            title: asLocalized(item.title),
            description: item.description
              ? asLocalized(item.description)
              : undefined,
            coverImageUrl: item.coverImageUrl ?? null,
            durationMinutes: item.durationMinutes ?? 30,
            passingScorePercentage: item.passingScorePercentage ?? 70,
            maxAttempts: item.maxAttempts ?? 1,
            shuffleQuestions: Boolean(item.shuffleQuestions),
            requiresUnlock: Boolean(item.requiresUnlock),
            priceLkr: item.priceLkr ?? null,
            status: item.status ?? QuizStatus.Draft,
            questions: questions.map((q) => ({
              questionText: asLocalized(q.questionText),
              type: q.type ?? QuestionType.MCQ,
              points: q.points ?? 1,
              choices: (q.choices ?? []).map((c) => ({
                choiceText: asLocalized(c.choiceText),
                isCorrect: Boolean(c.isCorrect),
                imageUrl: c.imageUrl ?? null,
              })),
            })),
          };
          await this.createQuiz(dto, userId);
        }
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`Quiz ${i + 1}: ${msg}`);
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
