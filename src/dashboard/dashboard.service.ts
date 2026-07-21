import { Injectable } from '@nestjs/common';
import {
  AttemptStatus,
  PaymentOrderStatus,
  Prisma,
  QuizStatus,
  Role,
  SlipSubmissionStatus,
  TeacherPayoutStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function asNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function monthStartUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUtc(start: Date, months: number): Date {
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, 0, 0, 0, 0),
  );
}

function teacherName(u: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
}): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name;
  return n?.trim() || u.email;
}

export interface OverviewQuery {
  paymentsPage?: number;
  paymentsPageSize?: number;
  teachersPage?: number;
  teachersPageSize?: number;
  quizzesPage?: number;
  quizzesPageSize?: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(user: { id: string; role: Role; workspaceId: string }) {
    if (user.role === Role.SUPER_ADMIN) {
      const overview = await this.getAdminOverview(user, {});
      return {
        userType: 'Admin' as const,
        totalStudents: overview.metrics.totalStudents,
        totalTeachers: overview.metrics.totalTeachers,
        totalQuizzes: overview.metrics.totalQuizzes,
        activeUsersCount: overview.metrics.activeUsers,
        totalWorkspacesCount: overview.metrics.totalWorkspaces,
      };
    }

    const isTeacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (isTeacher) {
      const [quizCount, attemptCount] = await Promise.all([
        this.prisma.quiz.count({ where: { createdById: user.id } }),
        this.prisma.quizAttempt.count({
          where: {
            teacherUserId: user.id,
            status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
          },
        }),
      ]);
      return {
        userType: 'Teacher' as const,
        totalStudents: 0,
        totalTeachers: 0,
        totalQuizzes: quizCount,
        completedAttempts: attemptCount,
      };
    }

    return {
      userType: 'Customer' as const,
      totalStudents: 0,
      totalTeachers: 0,
      totalQuizzes: 0,
    };
  }

  async getOverview(
    user: { id: string; role: Role; workspaceId: string },
    query: OverviewQuery,
  ) {
    if (user.role === Role.SUPER_ADMIN) {
      return this.getAdminOverview(user, query);
    }

    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (teacherProfile) {
      return this.getTeacherOverview(user.id, query);
    }

    return {
      userType: 'Student' as const,
      metrics: {
        totalStudents: 0,
        totalTeachers: 0,
        totalQuizzes: 0,
        publishedQuizzes: 0,
        activeUsers: 0,
        totalWorkspaces: 0,
        activeSubscriptions: 0,
        completedAttemptsMtd: 0,
        paidRevenueMtdLkr: 0,
        subscriptionRevenueMtdLkr: 0,
        pendingSlips: 0,
        pendingPayoutsLkr: 0,
        lifetimeEarnedLkr: 0,
        pendingPayoutLkr: 0,
        paidOutLkr: 0,
      },
      latestPeriod: null,
      trend: [],
      payments: { items: [], total: 0, page: 1, pageSize: 10 },
      topTeachers: { items: [], total: 0, page: 1, pageSize: 10 },
      topQuizzes: { items: [], total: 0, page: 1, pageSize: 10 },
    };
  }

  private async getAdminOverview(
    user: { workspaceId: string },
    query: OverviewQuery,
  ) {
    const paymentsPage = Math.max(1, Number(query.paymentsPage) || 1);
    const paymentsPageSize = Math.min(
      50,
      Math.max(5, Number(query.paymentsPageSize) || 10),
    );
    const teachersPage = Math.max(1, Number(query.teachersPage) || 1);
    const teachersPageSize = Math.min(
      50,
      Math.max(5, Number(query.teachersPageSize) || 10),
    );
    const quizzesPage = Math.max(1, Number(query.quizzesPage) || 1);
    const quizzesPageSize = Math.min(
      50,
      Math.max(5, Number(query.quizzesPageSize) || 10),
    );

    const now = new Date();
    const mtdStart = monthStartUtc(now);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      include: { subWorkspaces: { select: { id: true } } },
    });
    const workspaceIds = [
      user.workspaceId,
      ...(workspace?.subWorkspaces.map((w) => w.id) || []),
    ];

    const [
      totalStudents,
      totalTeachers,
      totalQuizzes,
      publishedQuizzes,
      activeUsers,
      totalWorkspaces,
      activeSubscriptions,
      completedAttemptsMtd,
      paidRevenueMtd,
      subscriptionRevenueMtd,
      pendingSlips,
      pendingPayouts,
      latestPeriod,
      trend,
      payments,
      topTeachers,
      topQuizzes,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          team: { equals: 'Student', mode: 'insensitive' },
          status: 'Active',
        },
      }),
      this.prisma.user.count({
        where: {
          OR: [
            { team: { equals: 'Teacher', mode: 'insensitive' } },
            { teacherProfile: { isNot: null } },
          ],
          status: 'Active',
        },
      }),
      this.prisma.quiz.count(),
      this.prisma.quiz.count({ where: { status: QuizStatus.Published } }),
      this.prisma.user.count({
        where: { workspaceId: { in: workspaceIds }, status: 'Active' },
      }),
      this.prisma.workspace.count({ where: { parentId: user.workspaceId } }),
      this.prisma.studentSubscription.count({
        where: { expiresAt: { gt: now } },
      }),
      this.prisma.quizAttempt.count({
        where: {
          status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
          submittedAt: { gte: mtdStart },
        },
      }),
      this.prisma.paymentOrder.aggregate({
        where: {
          status: PaymentOrderStatus.Paid,
          updatedAt: { gte: mtdStart },
        },
        _sum: { amountLkr: true },
      }),
      this.prisma.studentSubscription.aggregate({
        where: { createdAt: { gte: mtdStart } },
        _sum: { amountLkr: true },
      }),
      this.prisma.paymentSlipSubmission.count({
        where: { status: SlipSubmissionStatus.Pending },
      }),
      this.prisma.teacherPayout.aggregate({
        where: {
          status: {
            in: [TeacherPayoutStatus.Pending, TeacherPayoutStatus.Approved],
          },
        },
        _sum: { amountLkr: true },
      }),
      this.prisma.revenuePeriod.findFirst({
        orderBy: { periodStart: 'desc' },
      }),
      this.buildTrend(6),
      this.listRecentPayments(paymentsPage, paymentsPageSize),
      this.listTopTeachers(teachersPage, teachersPageSize, mtdStart),
      this.listTopQuizzes(quizzesPage, quizzesPageSize),
    ]);

    return {
      userType: 'Admin' as const,
      metrics: {
        totalStudents,
        totalTeachers,
        totalQuizzes,
        publishedQuizzes,
        activeUsers,
        totalWorkspaces,
        activeSubscriptions,
        completedAttemptsMtd,
        paidRevenueMtdLkr: asNumber(paidRevenueMtd._sum.amountLkr),
        subscriptionRevenueMtdLkr: asNumber(
          subscriptionRevenueMtd._sum.amountLkr,
        ),
        pendingSlips,
        pendingPayoutsLkr: asNumber(pendingPayouts._sum.amountLkr),
        lifetimeEarnedLkr: 0,
        pendingPayoutLkr: 0,
        paidOutLkr: 0,
      },
      latestPeriod: latestPeriod
        ? {
            id: latestPeriod.id,
            periodStart: latestPeriod.periodStart,
            periodEnd: latestPeriod.periodEnd,
            grossRevenueLkr: asNumber(latestPeriod.grossRevenueLkr),
            platformShareLkr: asNumber(latestPeriod.platformShareLkr),
            teacherPoolLkr: asNumber(latestPeriod.teacherPoolLkr),
            totalBillableAttempts: latestPeriod.totalBillableAttempts,
            status: latestPeriod.status,
          }
        : null,
      trend,
      payments,
      topTeachers,
      topQuizzes,
    };
  }

  private async getTeacherOverview(userId: string, query: OverviewQuery) {
    const quizzesPage = Math.max(1, Number(query.quizzesPage) || 1);
    const quizzesPageSize = Math.min(
      50,
      Math.max(5, Number(query.quizzesPageSize) || 10),
    );
    const mtdStart = monthStartUtc();

    const [
      totalQuizzes,
      publishedQuizzes,
      completedAttempts,
      completedAttemptsMtd,
      shares,
      payouts,
      topQuizzes,
    ] = await Promise.all([
      this.prisma.quiz.count({ where: { createdById: userId } }),
      this.prisma.quiz.count({
        where: { createdById: userId, status: QuizStatus.Published },
      }),
      this.prisma.quizAttempt.count({
        where: {
          teacherUserId: userId,
          status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
        },
      }),
      this.prisma.quizAttempt.count({
        where: {
          teacherUserId: userId,
          status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
          submittedAt: { gte: mtdStart },
        },
      }),
      this.prisma.teacherRevenueShare.findMany({
        where: { teacherUserId: userId },
        select: { amountLkr: true },
      }),
      this.prisma.teacherPayout.findMany({
        where: { teacherUserId: userId },
        select: { amountLkr: true, status: true },
      }),
      this.listTopQuizzes(quizzesPage, quizzesPageSize, userId),
    ]);

    const lifetimeEarnedLkr = shares.reduce(
      (s, x) => s + asNumber(x.amountLkr),
      0,
    );
    const pendingPayoutLkr = payouts
      .filter(
        (p) =>
          p.status === TeacherPayoutStatus.Pending ||
          p.status === TeacherPayoutStatus.Approved,
      )
      .reduce((s, x) => s + asNumber(x.amountLkr), 0);
    const paidOutLkr = payouts
      .filter((p) => p.status === TeacherPayoutStatus.Paid)
      .reduce((s, x) => s + asNumber(x.amountLkr), 0);

    const trend = await this.buildTeacherTrend(userId, 6);

    return {
      userType: 'Teacher' as const,
      metrics: {
        totalStudents: 0,
        totalTeachers: 0,
        totalQuizzes,
        publishedQuizzes,
        activeUsers: 0,
        totalWorkspaces: 0,
        activeSubscriptions: 0,
        completedAttemptsMtd,
        paidRevenueMtdLkr: 0,
        subscriptionRevenueMtdLkr: 0,
        pendingSlips: 0,
        pendingPayoutsLkr: pendingPayoutLkr,
        lifetimeEarnedLkr,
        pendingPayoutLkr,
        paidOutLkr,
        completedAttempts,
      },
      latestPeriod: null,
      trend,
      payments: { items: [], total: 0, page: 1, pageSize: 10 },
      topTeachers: { items: [], total: 0, page: 1, pageSize: 10 },
      topQuizzes,
    };
  }

  private async buildTrend(months: number) {
    const end = addMonthsUtc(monthStartUtc(), 1);
    const start = addMonthsUtc(monthStartUtc(), -(months - 1));

    const [subs, attempts] = await Promise.all([
      this.prisma.studentSubscription.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { createdAt: true, amountLkr: true },
      }),
      this.prisma.quizAttempt.findMany({
        where: {
          status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
          submittedAt: { gte: start, lt: end },
        },
        select: { submittedAt: true },
      }),
    ]);

    const buckets: {
      key: string;
      label: string;
      subscriptionRevenueLkr: number;
      completedAttempts: number;
    }[] = [];

    for (let i = 0; i < months; i++) {
      const d = addMonthsUtc(start, i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.push({
        key,
        label: d.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        subscriptionRevenueLkr: 0,
        completedAttempts: 0,
      });
    }

    const index = new Map(buckets.map((b, i) => [b.key, i]));

    for (const s of subs) {
      const d = s.createdAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const i = index.get(key);
      if (i != null) {
        buckets[i].subscriptionRevenueLkr += asNumber(s.amountLkr);
      }
    }
    for (const a of attempts) {
      if (!a.submittedAt) continue;
      const d = a.submittedAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const i = index.get(key);
      if (i != null) buckets[i].completedAttempts += 1;
    }

    return buckets.map((b) => ({
      ...b,
      subscriptionRevenueLkr: Math.round(b.subscriptionRevenueLkr * 100) / 100,
    }));
  }

  private async buildTeacherTrend(teacherUserId: string, months: number) {
    const end = addMonthsUtc(monthStartUtc(), 1);
    const start = addMonthsUtc(monthStartUtc(), -(months - 1));

    const [shares, attempts] = await Promise.all([
      this.prisma.teacherRevenueShare.findMany({
        where: {
          teacherUserId,
          period: { periodStart: { gte: start, lt: end } },
        },
        include: { period: { select: { periodStart: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: {
          teacherUserId,
          status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
          submittedAt: { gte: start, lt: end },
        },
        select: { submittedAt: true },
      }),
    ]);

    const buckets: {
      key: string;
      label: string;
      subscriptionRevenueLkr: number;
      completedAttempts: number;
    }[] = [];

    for (let i = 0; i < months; i++) {
      const d = addMonthsUtc(start, i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.push({
        key,
        label: d.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        subscriptionRevenueLkr: 0,
        completedAttempts: 0,
      });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));

    for (const s of shares) {
      const d = s.period.periodStart;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const i = index.get(key);
      if (i != null) {
        buckets[i].subscriptionRevenueLkr += asNumber(s.amountLkr);
      }
    }
    for (const a of attempts) {
      if (!a.submittedAt) continue;
      const d = a.submittedAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const i = index.get(key);
      if (i != null) buckets[i].completedAttempts += 1;
    }

    return buckets.map((b) => ({
      ...b,
      subscriptionRevenueLkr: Math.round(b.subscriptionRevenueLkr * 100) / 100,
    }));
  }

  private async listRecentPayments(page: number, pageSize: number) {
    const where: Prisma.PaymentOrderWhereInput = {
      status: {
        in: [
          PaymentOrderStatus.Paid,
          PaymentOrderStatus.Pending,
          PaymentOrderStatus.Failed,
        ],
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.paymentOrder.count({ where }),
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          quiz: { select: { id: true, title: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        purpose: r.purpose,
        status: r.status,
        amountLkr: asNumber(r.amountLkr),
        createdAt: r.createdAt,
        user: r.user
          ? {
              email: r.user.email,
              name: teacherName(r.user),
            }
          : null,
        quizTitle: r.quiz?.title ?? null,
        guestSessionId: r.guestSessionId,
      })),
    };
  }

  private async listTopTeachers(
    page: number,
    pageSize: number,
    mtdStart: Date,
  ) {
    const grouped = await this.prisma.quizAttempt.groupBy({
      by: ['teacherUserId'],
      where: {
        teacherUserId: { not: null },
        status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
        submittedAt: { gte: mtdStart },
      },
      _count: { _all: true },
    });

    grouped.sort((a, b) => b._count._all - a._count._all);
    const total = grouped.length;
    const slice = grouped.slice((page - 1) * pageSize, page * pageSize);
    const ids = slice
      .map((g) => g.teacherUserId)
      .filter((id): id is string => Boolean(id));

    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const shareAgg = ids.length
      ? await this.prisma.teacherRevenueShare.groupBy({
          by: ['teacherUserId'],
          where: { teacherUserId: { in: ids } },
          _sum: { amountLkr: true },
        })
      : [];
    const earned = new Map(
      shareAgg.map((s) => [s.teacherUserId, asNumber(s._sum.amountLkr)]),
    );

    return {
      page,
      pageSize,
      total,
      items: slice.map((g) => {
        const u = g.teacherUserId ? byId.get(g.teacherUserId) : null;
        return {
          teacherUserId: g.teacherUserId,
          name: u ? teacherName(u) : 'Unknown',
          email: u?.email ?? null,
          attemptsMtd: g._count._all,
          lifetimeEarnedLkr: g.teacherUserId
            ? earned.get(g.teacherUserId) ?? 0
            : 0,
        };
      }),
    };
  }

  private async listTopQuizzes(
    page: number,
    pageSize: number,
    createdById?: string,
  ) {
    try {
      const rows = createdById
        ? await this.prisma.$queryRaw<
            Array<{
              quiz_id: string;
              quiz_title_en: string;
              total_attempts: bigint;
              average_class_score: number | null;
              highest_score: number | null;
              lowest_score: number | null;
              passing_rate_percentage: number | null;
            }>
          >`
            SELECT v.quiz_id, v.quiz_title_en, v.total_attempts,
                   v.average_class_score, v.highest_score, v.lowest_score,
                   v.passing_rate_percentage
            FROM view_quiz_analytics v
            JOIN quizzes q ON q.id = v.quiz_id
            WHERE q.created_by = ${createdById}::uuid
            ORDER BY v.total_attempts DESC
          `
        : await this.prisma.$queryRaw<
            Array<{
              quiz_id: string;
              quiz_title_en: string;
              total_attempts: bigint;
              average_class_score: number | null;
              highest_score: number | null;
              lowest_score: number | null;
              passing_rate_percentage: number | null;
            }>
          >`
            SELECT quiz_id, quiz_title_en, total_attempts,
                   average_class_score, highest_score, lowest_score,
                   passing_rate_percentage
            FROM view_quiz_analytics
            ORDER BY total_attempts DESC
          `;

      const total = rows.length;
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      return {
        page,
        pageSize,
        total,
        items: slice.map((r) => ({
          quizId: r.quiz_id,
          title: r.quiz_title_en || 'Untitled',
          totalAttempts: Number(r.total_attempts),
          averageScore:
            r.average_class_score != null ? Number(r.average_class_score) : null,
          highestScore: r.highest_score != null ? Number(r.highest_score) : null,
          lowestScore: r.lowest_score != null ? Number(r.lowest_score) : null,
          passingRate:
            r.passing_rate_percentage != null
              ? Number(r.passing_rate_percentage)
              : null,
        })),
      };
    } catch {
      const where = createdById ? { createdById } : {};
      const [total, quizzes] = await Promise.all([
        this.prisma.quiz.count({ where }),
        this.prisma.quiz.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            title: true,
            status: true,
            _count: { select: { attempts: true } },
          },
        }),
      ]);
      return {
        page,
        pageSize,
        total,
        items: quizzes.map((q) => ({
          quizId: q.id,
          title:
            typeof q.title === 'object' &&
            q.title &&
            'en' in (q.title as object)
              ? String((q.title as { en?: string }).en || 'Untitled')
              : 'Untitled',
          totalAttempts: q._count.attempts,
          averageScore: null,
          highestScore: null,
          lowestScore: null,
          passingRate: null,
        })),
      };
    }
  }
}
