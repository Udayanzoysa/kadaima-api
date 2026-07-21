import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttemptStatus,
  Prisma,
  RevenuePeriodStatus,
  Role,
  TeacherPayoutStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-owner';
import {
  TEACHER_PAYOUT_EVENT,
  TeacherPayoutEvent,
  TeacherPayoutNotifyStatus,
} from '../notification/events/teacher-payout.event';
import {
  CalculateRevenuePeriodDto,
  UpdatePayoutStatusDto,
  UpsertTeacherPayoutProfileDto,
} from './dto/revenue.dto';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(n).toFixed(2));
}

function asNumber(value: Prisma.Decimal | number | string): number {
  return Number(value);
}

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private periodLabel(periodStart: Date): string {
    return periodStart.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private teacherDisplayName(u: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  }): string {
    return (
      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
      u.name?.trim() ||
      u.email
    );
  }

  private emitTeacherPayout(payload: {
    email: string;
    userName?: string | null;
    status: TeacherPayoutNotifyStatus;
    amountLkr: number;
    periodLabel: string;
    attemptCount?: number | null;
    reference?: string | null;
  }) {
    this.eventEmitter.emit(
      TEACHER_PAYOUT_EVENT,
      new TeacherPayoutEvent(
        payload.email,
        payload.userName,
        payload.status,
        payload.amountLkr,
        payload.periodLabel,
        payload.attemptCount,
        payload.reference,
      ),
    );
  }

  private async notifyPayoutsForPeriod(
    periodId: string,
    statusFilter: TeacherPayoutStatus[],
    notifyStatus: TeacherPayoutNotifyStatus,
  ) {
    try {
      const payouts = await this.prisma.teacherPayout.findMany({
        where: {
          periodId,
          status: { in: statusFilter },
        },
        include: {
          period: { select: { periodStart: true } },
          teacher: {
            select: {
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const shares = await this.prisma.teacherRevenueShare.findMany({
        where: { periodId },
        select: { teacherUserId: true, attemptCount: true },
      });
      const attemptsByTeacher = new Map(
        shares.map((s) => [s.teacherUserId, s.attemptCount]),
      );

      for (const p of payouts) {
        if (!p.teacher?.email) continue;
        this.emitTeacherPayout({
          email: p.teacher.email,
          userName: this.teacherDisplayName(p.teacher),
          status: notifyStatus,
          amountLkr: asNumber(p.amountLkr),
          periodLabel: this.periodLabel(p.period.periodStart),
          attemptCount: attemptsByTeacher.get(p.teacherUserId) ?? null,
          reference: p.reference,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Teacher payout emails skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listPeriods() {
    const periods = await this.prisma.revenuePeriod.findMany({
      orderBy: { periodStart: 'desc' },
      include: {
        _count: { select: { teacherShares: true, payouts: true } },
      },
    });
    return periods.map((p) => this.serializePeriod(p));
  }

  async getPeriod(id: string) {
    const period = await this.prisma.revenuePeriod.findUnique({
      where: { id },
      include: {
        teacherShares: {
          orderBy: { amountLkr: 'desc' },
          include: {
            teacher: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        payouts: {
          orderBy: { amountLkr: 'desc' },
          include: {
            teacher: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                payoutProfile: true,
              },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Revenue period not found');
    return {
      ...this.serializePeriod(period),
      shares: period.teacherShares.map((s) => ({
        id: s.id,
        teacherUserId: s.teacherUserId,
        attemptCount: s.attemptCount,
        shareRatio: asNumber(s.shareRatio),
        amountLkr: asNumber(s.amountLkr),
        teacher: s.teacher,
      })),
      payouts: period.payouts.map((p) => ({
        id: p.id,
        teacherUserId: p.teacherUserId,
        amountLkr: asNumber(p.amountLkr),
        status: p.status,
        paidAt: p.paidAt,
        reference: p.reference,
        teacher: {
          id: p.teacher.id,
          email: p.teacher.email,
          firstName: p.teacher.firstName,
          lastName: p.teacher.lastName,
          payoutProfile: p.teacher.payoutProfile
            ? {
                accountName: p.teacher.payoutProfile.accountName,
                bankName: p.teacher.payoutProfile.bankName,
                accountNumber: p.teacher.payoutProfile.accountNumber,
                branch: p.teacher.payoutProfile.branch,
              }
            : null,
        },
      })),
    };
  }

  async calculatePeriod(dto: CalculateRevenuePeriodDto) {
    const { start, end } = monthBounds(dto.year, dto.month);
    const existing = await this.prisma.revenuePeriod.findUnique({
      where: { periodStart: start },
    });

    if (existing?.status === RevenuePeriodStatus.Paid) {
      throw new BadRequestException(
        'This period is already marked Paid and cannot be recalculated.',
      );
    }
    if (
      existing?.status === RevenuePeriodStatus.Settled &&
      !dto.force
    ) {
      throw new BadRequestException(
        'Period is Settled. Pass force=true to recalculate (payouts will be rebuilt).',
      );
    }

    const billing = await this.settings.getBillingSettings();
    const platformPct = billing.platformPct;
    const teacherPoolPct = billing.teacherPoolPct;

    const excludedTeacherIds = await this.resolveExcludedTeacherIds();

    const revenueAgg = await this.prisma.studentSubscription.aggregate({
      where: {
        createdAt: { gte: start, lt: end },
      },
      _sum: { amountLkr: true },
    });
    const grossRevenueLkr = asNumber(revenueAgg._sum.amountLkr ?? 0);
    const platformShareLkr = roundMoney((grossRevenueLkr * platformPct) / 100);
    const teacherPoolLkr = roundMoney(
      (grossRevenueLkr * teacherPoolPct) / 100,
    );

    const attemptWhere: Prisma.QuizAttemptWhereInput = {
      status: { in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out] },
      submittedAt: { gte: start, lt: end },
      teacherUserId: excludedTeacherIds.length
        ? { notIn: excludedTeacherIds }
        : { not: null },
    };

    const grouped = await this.prisma.quizAttempt.groupBy({
      by: ['teacherUserId'],
      where: attemptWhere,
      _count: { _all: true },
    });

    const teacherRows = grouped
      .filter((g) => g.teacherUserId)
      .map((g) => ({
        teacherUserId: g.teacherUserId as string,
        attemptCount: g._count._all,
      }));

    const totalBillableAttempts = teacherRows.reduce(
      (sum, r) => sum + r.attemptCount,
      0,
    );

    const shares = teacherRows.map((row) => {
      const shareRatio =
        totalBillableAttempts > 0
          ? row.attemptCount / totalBillableAttempts
          : 0;
      const amountLkr = roundMoney(shareRatio * teacherPoolLkr);
      return {
        teacherUserId: row.teacherUserId,
        attemptCount: row.attemptCount,
        shareRatio,
        amountLkr,
      };
    });

    // Fix rounding drift on last share so pool sums match.
    if (shares.length > 0 && teacherPoolLkr > 0) {
      const allocated = shares.reduce((s, x) => s + x.amountLkr, 0);
      const drift = roundMoney(teacherPoolLkr - allocated);
      if (drift !== 0) {
        shares[0].amountLkr = roundMoney(shares[0].amountLkr + drift);
      }
    }

    const period = await this.prisma.$transaction(async (tx) => {
      const upserted = existing
        ? await tx.revenuePeriod.update({
            where: { id: existing.id },
            data: {
              periodEnd: end,
              grossRevenueLkr: dec(grossRevenueLkr),
              platformShareLkr: dec(platformShareLkr),
              teacherPoolLkr: dec(teacherPoolLkr),
              totalBillableAttempts,
              status: RevenuePeriodStatus.Calculating,
              calculatedAt: new Date(),
              settledAt: null,
              notes: `platformPct=${platformPct}; teacherPoolPct=${teacherPoolPct}`,
            },
          })
        : await tx.revenuePeriod.create({
            data: {
              periodStart: start,
              periodEnd: end,
              grossRevenueLkr: dec(grossRevenueLkr),
              platformShareLkr: dec(platformShareLkr),
              teacherPoolLkr: dec(teacherPoolLkr),
              totalBillableAttempts,
              status: RevenuePeriodStatus.Calculating,
              calculatedAt: new Date(),
              notes: `platformPct=${platformPct}; teacherPoolPct=${teacherPoolPct}`,
            },
          });

      await tx.teacherPayout.deleteMany({ where: { periodId: upserted.id } });
      await tx.teacherRevenueShare.deleteMany({
        where: { periodId: upserted.id },
      });

      if (shares.length) {
        await tx.teacherRevenueShare.createMany({
          data: shares.map((s) => ({
            periodId: upserted.id,
            teacherUserId: s.teacherUserId,
            attemptCount: s.attemptCount,
            shareRatio: new Prisma.Decimal(s.shareRatio.toFixed(8)),
            amountLkr: dec(s.amountLkr),
          })),
        });
      }

      return upserted;
    });

    return this.getPeriod(period.id);
  }

  async settlePeriod(id: string) {
    const period = await this.prisma.revenuePeriod.findUnique({
      where: { id },
      include: { teacherShares: true },
    });
    if (!period) throw new NotFoundException('Revenue period not found');
    if (period.status === RevenuePeriodStatus.Paid) {
      throw new BadRequestException('Period is already Paid.');
    }
    if (!period.calculatedAt) {
      throw new BadRequestException(
        'Calculate the period before settling payouts.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherPayout.deleteMany({ where: { periodId: id } });
      if (period.teacherShares.length) {
        await tx.teacherPayout.createMany({
          data: period.teacherShares.map((s) => ({
            periodId: id,
            teacherUserId: s.teacherUserId,
            amountLkr: s.amountLkr,
            status: TeacherPayoutStatus.Pending,
          })),
        });
      }
      await tx.revenuePeriod.update({
        where: { id },
        data: {
          status: RevenuePeriodStatus.Settled,
          settledAt: new Date(),
        },
      });
    });

    await this.notifyPayoutsForPeriod(
      id,
      [TeacherPayoutStatus.Pending],
      'Pending',
    );

    return this.getPeriod(id);
  }

  async markPeriodPaid(id: string) {
    const period = await this.prisma.revenuePeriod.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException('Revenue period not found');
    if (period.status !== RevenuePeriodStatus.Settled) {
      throw new BadRequestException(
        'Settle the period before marking it Paid.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherPayout.updateMany({
        where: {
          periodId: id,
          status: {
            in: [TeacherPayoutStatus.Pending, TeacherPayoutStatus.Approved],
          },
        },
        data: {
          status: TeacherPayoutStatus.Paid,
          paidAt: new Date(),
        },
      });
      await tx.revenuePeriod.update({
        where: { id },
        data: { status: RevenuePeriodStatus.Paid },
      });
    });

    await this.notifyPayoutsForPeriod(id, [TeacherPayoutStatus.Paid], 'Paid');

    return this.getPeriod(id);
  }

  async listPayouts(periodId?: string) {
    const payouts = await this.prisma.teacherPayout.findMany({
      where: periodId ? { periodId } : undefined,
      orderBy: [{ period: { periodStart: 'desc' } }, { amountLkr: 'desc' }],
      include: {
        period: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
        teacher: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            payoutProfile: true,
          },
        },
      },
    });

    return payouts.map((p) => ({
      id: p.id,
      periodId: p.periodId,
      teacherUserId: p.teacherUserId,
      amountLkr: asNumber(p.amountLkr),
      status: p.status,
      paidAt: p.paidAt,
      reference: p.reference,
      period: p.period,
      teacher: {
        id: p.teacher.id,
        email: p.teacher.email,
        firstName: p.teacher.firstName,
        lastName: p.teacher.lastName,
        payoutProfile: p.teacher.payoutProfile
          ? {
              accountName: p.teacher.payoutProfile.accountName,
              bankName: p.teacher.payoutProfile.bankName,
              accountNumber: p.teacher.payoutProfile.accountNumber,
              branch: p.teacher.payoutProfile.branch,
            }
          : null,
      },
    }));
  }

  async updatePayout(id: string, dto: UpdatePayoutStatusDto) {
    const payout = await this.prisma.teacherPayout.findUnique({
      where: { id },
      include: {
        period: { select: { periodStart: true } },
        teacher: {
          select: {
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    const allowed = Object.values(TeacherPayoutStatus);
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException('Invalid payout status');
    }

    const previousStatus = payout.status;
    const updated = await this.prisma.teacherPayout.update({
      where: { id },
      data: {
        status: dto.status,
        reference: dto.reference ?? payout.reference,
        paidAt:
          dto.status === TeacherPayoutStatus.Paid
            ? payout.paidAt ?? new Date()
            : null,
      },
    });

    if (previousStatus !== updated.status && payout.teacher?.email) {
      const share = await this.prisma.teacherRevenueShare.findUnique({
        where: {
          periodId_teacherUserId: {
            periodId: payout.periodId,
            teacherUserId: payout.teacherUserId,
          },
        },
        select: { attemptCount: true },
      });
      this.emitTeacherPayout({
        email: payout.teacher.email,
        userName: this.teacherDisplayName(payout.teacher),
        status: updated.status as TeacherPayoutNotifyStatus,
        amountLkr: asNumber(updated.amountLkr),
        periodLabel: this.periodLabel(payout.period.periodStart),
        attemptCount: share?.attemptCount ?? null,
        reference: updated.reference,
      });
    }

    return {
      id: updated.id,
      periodId: updated.periodId,
      teacherUserId: updated.teacherUserId,
      amountLkr: asNumber(updated.amountLkr),
      status: updated.status,
      paidAt: updated.paidAt,
      reference: updated.reference,
    };
  }

  async getTeacherEarnings(teacherUserId: string) {
    const [shares, payouts, profile, recentAttempts] = await Promise.all([
      this.prisma.teacherRevenueShare.findMany({
        where: { teacherUserId },
        orderBy: { period: { periodStart: 'desc' } },
        include: {
          period: {
            select: {
              id: true,
              periodStart: true,
              periodEnd: true,
              status: true,
              teacherPoolLkr: true,
              totalBillableAttempts: true,
            },
          },
        },
      }),
      this.prisma.teacherPayout.findMany({
        where: { teacherUserId },
        orderBy: { createdAt: 'desc' },
        include: {
          period: {
            select: {
              id: true,
              periodStart: true,
              periodEnd: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.teacherPayoutProfile.findUnique({
        where: { userId: teacherUserId },
      }),
      this.prisma.quizAttempt.count({
        where: {
          teacherUserId,
          status: {
            in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out],
          },
        },
      }),
    ]);

    const lifetimeEarnedLkr = shares.reduce(
      (sum, s) => sum + asNumber(s.amountLkr),
      0,
    );
    const pendingPayoutLkr = payouts
      .filter(
        (p) =>
          p.status === TeacherPayoutStatus.Pending ||
          p.status === TeacherPayoutStatus.Approved,
      )
      .reduce((sum, p) => sum + asNumber(p.amountLkr), 0);
    const paidOutLkr = payouts
      .filter((p) => p.status === TeacherPayoutStatus.Paid)
      .reduce((sum, p) => sum + asNumber(p.amountLkr), 0);

    return {
      summary: {
        lifetimeEarnedLkr: roundMoney(lifetimeEarnedLkr),
        pendingPayoutLkr: roundMoney(pendingPayoutLkr),
        paidOutLkr: roundMoney(paidOutLkr),
        completedAttempts: recentAttempts,
      },
      periods: shares.map((s) => ({
        periodId: s.period.id,
        periodStart: s.period.periodStart,
        periodEnd: s.period.periodEnd,
        periodStatus: s.period.status,
        attemptCount: s.attemptCount,
        shareRatio: asNumber(s.shareRatio),
        amountLkr: asNumber(s.amountLkr),
        teacherPoolLkr: asNumber(s.period.teacherPoolLkr),
        totalBillableAttempts: s.period.totalBillableAttempts,
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        periodId: p.periodId,
        periodStart: p.period.periodStart,
        periodEnd: p.period.periodEnd,
        amountLkr: asNumber(p.amountLkr),
        status: p.status,
        paidAt: p.paidAt,
        reference: p.reference,
      })),
      payoutProfile: profile
        ? {
            accountName: profile.accountName,
            bankName: profile.bankName,
            accountNumber: profile.accountNumber,
            branch: profile.branch,
          }
        : null,
    };
  }

  async getPayoutProfile(userId: string) {
    const profile = await this.prisma.teacherPayoutProfile.findUnique({
      where: { userId },
    });
    return profile
      ? {
          accountName: profile.accountName,
          bankName: profile.bankName,
          accountNumber: profile.accountNumber,
          branch: profile.branch,
        }
      : {
          accountName: null,
          bankName: null,
          accountNumber: null,
          branch: null,
        };
  }

  async upsertPayoutProfile(
    userId: string,
    dto: UpsertTeacherPayoutProfileDto,
  ) {
    const profile = await this.prisma.teacherPayoutProfile.upsert({
      where: { userId },
      create: {
        userId,
        accountName: dto.accountName ?? null,
        bankName: dto.bankName ?? null,
        accountNumber: dto.accountNumber ?? null,
        branch: dto.branch ?? null,
      },
      update: {
        accountName: dto.accountName ?? null,
        bankName: dto.bankName ?? null,
        accountNumber: dto.accountNumber ?? null,
        branch: dto.branch ?? null,
      },
    });
    return {
      accountName: profile.accountName,
      bankName: profile.bankName,
      accountNumber: profile.accountNumber,
      branch: profile.branch,
    };
  }

  private async resolveExcludedTeacherIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { equals: PLATFORM_OWNER_EMAIL, mode: 'insensitive' } },
          { role: Role.SUPER_ADMIN },
        ],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private serializePeriod(period: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    grossRevenueLkr: Prisma.Decimal;
    platformShareLkr: Prisma.Decimal;
    teacherPoolLkr: Prisma.Decimal;
    totalBillableAttempts: number;
    status: RevenuePeriodStatus;
    calculatedAt: Date | null;
    settledAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { teacherShares: number; payouts: number };
  }) {
    return {
      id: period.id,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      grossRevenueLkr: asNumber(period.grossRevenueLkr),
      platformShareLkr: asNumber(period.platformShareLkr),
      teacherPoolLkr: asNumber(period.teacherPoolLkr),
      totalBillableAttempts: period.totalBillableAttempts,
      status: period.status,
      calculatedAt: period.calculatedAt,
      settledAt: period.settledAt,
      notes: period.notes,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      shareCount: period._count?.teacherShares,
      payoutCount: period._count?.payouts,
    };
  }
}
