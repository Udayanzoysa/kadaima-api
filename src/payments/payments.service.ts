import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentOrderStatus,
  PaymentProvider,
  QuizStatus,
  SlipSubmissionStatus,
  UnlockMethod,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PayHereCheckoutDto } from './dto/payhere-checkout.dto';
import {
  CreateVoucherDto,
  RedeemVoucherDto,
  UpdateVoucherDto,
} from './dto/unlock-methods.dto';
import {
  isSpecialPricedQuiz,
  mergeBilling,
  type PaymentMode,
} from '../settings/notification-config.types';
import {
  formatPayHereAmount,
  newPayHereOrderId,
  newSubscriptionOrderId,
  payhereCheckoutHash,
  payhereNotifyHash,
} from './payhere.util';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  private async getBilling() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: 'default' },
    });
    return mergeBilling(row?.billing);
  }

  async getMonthlyFeeLkr(): Promise<number> {
    return (await this.getBilling()).monthlyStudentFeeLkr;
  }

  async getPublicBilling() {
    const billing = await this.getBilling();
    return {
      monthlyStudentFeeLkr: billing.monthlyStudentFeeLkr,
      paymentMode: billing.paymentMode as PaymentMode,
    };
  }

  async getSubscriptionStatus(userId: string) {
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    const billing = await this.getBilling();
    return {
      active: Boolean(sub),
      expiresAt: sub?.expiresAt ?? null,
      startsAt: sub?.startsAt ?? null,
      monthlyStudentFeeLkr: billing.monthlyStudentFeeLkr,
      paymentMode: billing.paymentMode,
    };
  }

  async hasActiveSubscription(userId?: string | null): Promise<boolean> {
    if (!userId) return false;
    const sub = await this.prisma.studentSubscription.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(sub);
  }

  private async activateSubscription(params: {
    userId: string;
    amountLkr: number | string;
    paymentOrderId?: string | null;
  }) {
    const now = new Date();
    const existing = await this.prisma.studentSubscription.findFirst({
      where: { userId: params.userId },
      orderBy: { expiresAt: 'desc' },
    });

    const base =
      existing && existing.expiresAt.getTime() > now.getTime()
        ? existing.expiresAt
        : now;
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.studentSubscription.create({
      data: {
        id: randomUUID(),
        userId: params.userId,
        startsAt: now,
        expiresAt,
        amountLkr: params.amountLkr,
        paymentOrderId: params.paymentOrderId || null,
      },
    });

    return { expiresAt };
  }

  async createSubscriptionCheckout(dto: {
    userId: string;
    guestSessionId?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  }) {
    if (!dto.userId) {
      throw new BadRequestException('Login is required before subscribing.');
    }

    const billing = await this.getBilling();
    if (billing.paymentMode === 'QUIZ_ONLY') {
      throw new BadRequestException(
        'Monthly subscriptions are disabled. This platform uses per-quiz payments only.',
      );
    }

    const fee = billing.monthlyStudentFeeLkr;
    if (fee <= 0) {
      throw new BadRequestException(
        'Monthly subscription fee is not configured. Ask an admin to set it in Settings → Subscription.',
      );
    }

    const amount = formatPayHereAmount(fee);
    const orderId = newSubscriptionOrderId();
    const cfg = this.payhereConfig();
    const hash = payhereCheckoutHash({
      merchantId: cfg.merchantId,
      orderId,
      amount,
      currency: 'LKR',
      merchantSecret: cfg.merchantSecret,
    });

    await this.prisma.paymentOrder.create({
      data: {
        id: randomUUID(),
        orderId,
        quizId: null,
        purpose: 'SUBSCRIPTION',
        guestSessionId: dto.guestSessionId || null,
        userId: dto.userId,
        amountLkr: fee,
        currency: 'LKR',
        status: PaymentOrderStatus.Pending,
        provider: PaymentProvider.PayHere,
      },
    });

    return {
      sandbox: cfg.sandbox,
      merchant_id: cfg.merchantId,
      return_url: `${cfg.frontendUrl}/?payment=subscription-return`,
      cancel_url: `${cfg.frontendUrl}/?payment=subscription-cancel`,
      notify_url: cfg.notifyUrl,
      order_id: orderId,
      items: 'Kadaima monthly student subscription',
      amount,
      currency: 'LKR',
      hash,
      first_name: dto.firstName || 'Student',
      last_name: dto.lastName || 'Student',
      email: dto.email || 'guest@example.com',
      phone: dto.phone || '0700000000',
      address: dto.address || 'Colombo',
      city: dto.city || 'Colombo',
      country: 'Sri Lanka',
    };
  }

  private payhereConfig() {
    const merchantId = process.env.PAYHERE_MERCHANT_ID?.trim();
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET?.trim();
    const mode = (process.env.PAYHERE_MODE || 'sandbox').toLowerCase();
    const notifyUrl = process.env.PAYHERE_NOTIFY_URL?.trim();
    const frontendUrl = (
      process.env.FRONTEND_URL ||
      process.env.PAYHERE_RETURN_BASE_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    if (!merchantId || !merchantSecret) {
      throw new BadRequestException(
        'PayHere is not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET.',
      );
    }
    if (!notifyUrl) {
      throw new BadRequestException(
        'PayHere notify URL is not configured. Set PAYHERE_NOTIFY_URL to a publicly reachable URL.',
      );
    }

    return {
      merchantId,
      merchantSecret,
      sandbox: mode !== 'live',
      notifyUrl,
      frontendUrl,
    };
  }

  private async assertLockedQuiz(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        status: true,
        requiresUnlock: true,
        priceLkr: true,
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== QuizStatus.Published) {
      throw new BadRequestException('This quiz is not available.');
    }
    if (!quiz.requiresUnlock) {
      throw new BadRequestException('This quiz does not require unlock.');
    }
    return quiz;
  }

  private async assertNotUnlocked(
    quizId: string,
    guestSessionId?: string,
    userId?: string,
  ) {
    if (guestSessionId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, guestSessionId },
      });
      if (row) throw new BadRequestException('This quiz is already unlocked for you.');
    }
    if (userId) {
      const row = await this.prisma.quizUnlock.findFirst({
        where: { quizId, userId },
      });
      if (row) throw new BadRequestException('This quiz is already unlocked for you.');
    }
  }

  private async grantUnlock(params: {
    quizId: string;
    guestSessionId?: string | null;
    userId?: string | null;
    method: UnlockMethod;
    paymentOrderId?: string;
    voucherCodeId?: string;
    slipSubmissionId?: string;
  }) {
    // Prefer account unlock so logged-in students keep access across devices/sessions.
    if (params.userId) {
      await this.prisma.quizUnlock.upsert({
        where: {
          quizId_userId: {
            quizId: params.quizId,
            userId: params.userId,
          },
        },
        create: {
          id: randomUUID(),
          quizId: params.quizId,
          userId: params.userId,
          guestSessionId: params.guestSessionId || null,
          method: params.method,
          paymentOrderId: params.paymentOrderId,
          voucherCodeId: params.voucherCodeId,
          slipSubmissionId: params.slipSubmissionId,
        },
        update: {
          method: params.method,
          guestSessionId: params.guestSessionId || undefined,
          paymentOrderId: params.paymentOrderId,
          voucherCodeId: params.voucherCodeId,
          slipSubmissionId: params.slipSubmissionId,
        },
      });
      return;
    }

    if (params.guestSessionId) {
      await this.prisma.quizUnlock.upsert({
        where: {
          quizId_guestSessionId: {
            quizId: params.quizId,
            guestSessionId: params.guestSessionId,
          },
        },
        create: {
          id: randomUUID(),
          quizId: params.quizId,
          guestSessionId: params.guestSessionId,
          userId: null,
          method: params.method,
          paymentOrderId: params.paymentOrderId,
          voucherCodeId: params.voucherCodeId,
          slipSubmissionId: params.slipSubmissionId,
        },
        update: {
          method: params.method,
          paymentOrderId: params.paymentOrderId,
          voucherCodeId: params.voucherCodeId,
          slipSubmissionId: params.slipSubmissionId,
        },
      });
      return;
    }

    throw new BadRequestException('Login is required to unlock this quiz.');
  }

  async createPayHereCheckout(dto: PayHereCheckoutDto & { userId: string }) {
    if (!dto.userId) {
      throw new BadRequestException('Login is required before payment.');
    }
    const billing = await this.getBilling();
    if (billing.paymentMode === 'MONTHLY_ONLY') {
      throw new BadRequestException(
        'Per-quiz payments are disabled. Subscribe monthly to unlock locked quizzes.',
      );
    }
    const quiz = await this.assertLockedQuiz(dto.quizId);
    const priceLkr =
      quiz.priceLkr != null ? Number(quiz.priceLkr.toString()) : null;
    if (!isSpecialPricedQuiz(priceLkr)) {
      throw new BadRequestException(
        billing.paymentMode === 'MIXED'
          ? 'This quiz is covered by the monthly subscription (no separate price).'
          : 'This quiz has no price configured.',
      );
    }
    await this.assertNotUnlocked(quiz.id, dto.guestSessionId, dto.userId);

    const amount = formatPayHereAmount(priceLkr!);
    const orderId = newPayHereOrderId(quiz.id);
    const cfg = this.payhereConfig();
    const hash = payhereCheckoutHash({
      merchantId: cfg.merchantId,
      orderId,
      amount,
      currency: 'LKR',
      merchantSecret: cfg.merchantSecret,
    });

    await this.prisma.paymentOrder.create({
      data: {
        id: randomUUID(),
        orderId,
        quizId: quiz.id,
        guestSessionId: dto.guestSessionId || null,
        userId: dto.userId,
        amountLkr: priceLkr!,
        currency: 'LKR',
        status: PaymentOrderStatus.Pending,
        provider: PaymentProvider.PayHere,
      },
    });

    const title =
      typeof quiz.title === 'object' && quiz.title && 'en' in (quiz.title as object)
        ? String((quiz.title as { en?: string }).en || 'Quiz unlock')
        : 'Quiz unlock';

    return {
      sandbox: cfg.sandbox,
      merchant_id: cfg.merchantId,
      return_url: `${cfg.frontendUrl}/quiz/${quiz.id}?payment=return`,
      cancel_url: `${cfg.frontendUrl}/quiz/${quiz.id}?payment=cancel`,
      notify_url: cfg.notifyUrl,
      order_id: orderId,
      items: title.slice(0, 255),
      amount,
      currency: 'LKR',
      hash,
      first_name: dto.firstName || 'Student',
      last_name: dto.lastName || 'Guest',
      email: dto.email || 'guest@example.com',
      phone: dto.phone || '0700000000',
      address: dto.address || 'Colombo',
      city: dto.city || 'Colombo',
      country: 'Sri Lanka',
    };
  }

  async handlePayHereNotify(body: Record<string, string | undefined>) {
    const merchantId = String(body.merchant_id || '');
    const orderId = String(body.order_id || '');
    const payhereAmount = String(body.payhere_amount || '');
    const payhereCurrency = String(body.payhere_currency || '');
    const statusCode = String(body.status_code || '');
    const md5sig = String(body.md5sig || '').toUpperCase();
    const paymentId = body.payment_id ? String(body.payment_id) : null;

    const cfg = this.payhereConfig();
    if (merchantId && merchantId !== cfg.merchantId) {
      throw new BadRequestException('Invalid merchant.');
    }

    const expected = payhereNotifyHash({
      merchantId: cfg.merchantId,
      orderId,
      amount: payhereAmount,
      currency: payhereCurrency,
      statusCode,
      merchantSecret: cfg.merchantSecret,
    });

    if (!md5sig || md5sig !== expected) {
      throw new BadRequestException('Invalid PayHere signature.');
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
    });
    if (!order) throw new NotFoundException('Payment order not found');

    if (statusCode === '2') {
      if (order.status === PaymentOrderStatus.Paid) {
        return { ok: true, alreadyPaid: true };
      }

      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.Paid,
          providerPaymentId: paymentId,
        },
      });

      if (order.purpose === 'SUBSCRIPTION') {
        if (!order.userId) {
          throw new BadRequestException('Subscription payment is missing user.');
        }
        await this.activateSubscription({
          userId: order.userId,
          amountLkr: Number(order.amountLkr),
          paymentOrderId: order.id,
        });
      } else if (order.quizId) {
        await this.grantUnlock({
          quizId: order.quizId,
          guestSessionId: order.guestSessionId,
          userId: order.userId,
          method: UnlockMethod.PayHere,
          paymentOrderId: order.id,
        });
      }

      return { ok: true };
    }

    const failedStatus =
      statusCode === '-1' || statusCode === '-2'
        ? PaymentOrderStatus.Cancelled
        : PaymentOrderStatus.Failed;

    if (order.status === PaymentOrderStatus.Pending) {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: failedStatus,
          providerPaymentId: paymentId,
        },
      });
    }

    return { ok: true, status: failedStatus };
  }

  async completeSandboxPayment(orderId: string, guestSessionId: string) {
    const mode = (process.env.PAYHERE_MODE || 'sandbox').toLowerCase();
    if (mode === 'live') {
      throw new BadRequestException('Sandbox complete is disabled in live mode.');
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
    });
    if (!order) throw new NotFoundException('Payment order not found');
    if (order.guestSessionId !== guestSessionId) {
      throw new BadRequestException('Guest session does not match this order.');
    }

    if (order.status === PaymentOrderStatus.Paid) {
      return { ok: true, alreadyPaid: true };
    }

    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: PaymentOrderStatus.Paid },
    });

    if (order.purpose === 'SUBSCRIPTION') {
      if (!order.userId) {
        throw new BadRequestException('Subscription payment is missing user.');
      }
      await this.activateSubscription({
        userId: order.userId,
        amountLkr: Number(order.amountLkr),
        paymentOrderId: order.id,
      });
    } else if (order.quizId) {
      await this.grantUnlock({
        quizId: order.quizId,
        guestSessionId: order.guestSessionId,
        userId: order.userId,
        method: UnlockMethod.PayHere,
        paymentOrderId: order.id,
      });
    }

    return { ok: true };
  }

  async redeemVoucher(dto: RedeemVoucherDto & { userId: string }) {
    if (!dto.userId) {
      throw new BadRequestException('Login is required to redeem a voucher.');
    }
    const quiz = await this.assertLockedQuiz(dto.quizId);
    await this.assertNotUnlocked(quiz.id, dto.guestSessionId, dto.userId);

    const code = dto.code.trim().toUpperCase();
    const voucher = await this.prisma.unlockVoucher.findUnique({
      where: { code },
    });
    if (!voucher || !voucher.isActive) {
      throw new BadRequestException('Invalid or inactive voucher code.');
    }
    if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This voucher has expired.');
    }
    if (voucher.redemptionCount >= voucher.maxRedemptions) {
      throw new BadRequestException('This voucher has reached its redemption limit.');
    }
    if (voucher.quizId && voucher.quizId !== quiz.id) {
      throw new BadRequestException('This voucher is not valid for this quiz.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.unlockVoucher.update({
        where: { id: voucher.id },
        data: { redemptionCount: { increment: 1 } },
      });
    });

    await this.grantUnlock({
      quizId: quiz.id,
      guestSessionId: dto.guestSessionId || null,
      userId: dto.userId,
      method: UnlockMethod.Voucher,
      voucherCodeId: voucher.id,
    });

    return { ok: true, method: 'Voucher' as const };
  }

  async submitSlip(params: {
    quizId: string;
    guestSessionId?: string | null;
    userId: string;
    slipImageUrl: string;
    bankReference?: string;
    note?: string;
  }) {
    if (!params.userId) {
      throw new BadRequestException('Login is required to submit a bank slip.');
    }
    const quiz = await this.assertLockedQuiz(params.quizId);
    await this.assertNotUnlocked(quiz.id, params.guestSessionId || undefined, params.userId);

    const pending = await this.prisma.paymentSlipSubmission.findFirst({
      where: {
        quizId: quiz.id,
        status: SlipSubmissionStatus.Pending,
        OR: [
          { userId: params.userId },
          ...(params.guestSessionId
            ? [{ guestSessionId: params.guestSessionId }]
            : []),
        ],
      },
    });
    if (pending) {
      throw new BadRequestException(
        'You already have a pending bank slip for this quiz. Wait for admin review.',
      );
    }

    const slip = await this.prisma.paymentSlipSubmission.create({
      data: {
        id: randomUUID(),
        quizId: quiz.id,
        guestSessionId: params.guestSessionId || null,
        userId: params.userId,
        slipImageUrl: params.slipImageUrl,
        bankReference: params.bankReference?.trim() || null,
        note: params.note?.trim() || null,
        status: SlipSubmissionStatus.Pending,
      },
    });

    return {
      id: slip.id,
      status: slip.status,
      message: 'Bank slip submitted. An admin will review it shortly.',
    };
  }

  async listVouchers() {
    return this.prisma.unlockVoucher.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: { select: { id: true, title: true } },
        _count: { select: { unlocks: true } },
      },
    });
  }

  async createVoucher(dto: CreateVoucherDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.unlockVoucher.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('Voucher code already exists.');

    if (dto.quizId) {
      const quiz = await this.prisma.quiz.findUnique({ where: { id: dto.quizId } });
      if (!quiz) throw new NotFoundException('Quiz not found');
    }

    return this.prisma.unlockVoucher.create({
      data: {
        id: randomUUID(),
        code,
        quizId: dto.quizId || null,
        maxRedemptions: dto.maxRedemptions ?? 1,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive ?? true,
      },
      include: { quiz: { select: { id: true, title: true } } },
    });
  }

  async updateVoucher(id: string, dto: UpdateVoucherDto) {
    const voucher = await this.prisma.unlockVoucher.findUnique({ where: { id } });
    if (!voucher) throw new NotFoundException('Voucher not found');

    return this.prisma.unlockVoucher.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        maxRedemptions: dto.maxRedemptions,
        expiresAt:
          dto.expiresAt === undefined
            ? undefined
            : dto.expiresAt
              ? new Date(dto.expiresAt)
              : null,
      },
      include: { quiz: { select: { id: true, title: true } } },
    });
  }

  async listSlips(status?: SlipSubmissionStatus) {
    return this.prisma.paymentSlipSubmission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: { select: { id: true, title: true, priceLkr: true } },
        user: { select: { id: true, email: true, name: true, phoneNumber: true } },
        unlock: { select: { id: true } },
      },
    });
  }

  async approveSlip(id: string) {
    const slip = await this.prisma.paymentSlipSubmission.findUnique({
      where: { id },
      include: {
        quiz: { select: { id: true, priceLkr: true } },
      },
    });
    if (!slip) throw new NotFoundException('Slip not found');

    const alreadyApproved = slip.status === SlipSubmissionStatus.Approved;
    if (!alreadyApproved) {
      await this.prisma.paymentSlipSubmission.update({
        where: { id },
        data: {
          status: SlipSubmissionStatus.Approved,
          reviewedAt: new Date(),
        },
      });
    }

    // Always ensure unlock row exists (safe to re-run if already approved).
    await this.grantUnlock({
      quizId: slip.quizId,
      guestSessionId: slip.guestSessionId,
      userId: slip.userId,
      method: UnlockMethod.Slip,
      slipSubmissionId: slip.id,
    });

    const billing = await this.getBilling();
    // In monthly-only mode a bank slip counts as paying the monthly plan.
    if (billing.paymentMode === 'MONTHLY_ONLY' && slip.userId) {
      const hasSub = await this.hasActiveSubscription(slip.userId);
      if (!hasSub) {
        const amount =
          slip.quiz.priceLkr != null
            ? Number(slip.quiz.priceLkr)
            : billing.monthlyStudentFeeLkr;
        await this.activateSubscription({
          userId: slip.userId,
          amountLkr: amount > 0 ? amount : billing.monthlyStudentFeeLkr,
        });
      }
    }

    return { ok: true, alreadyApproved };
  }

  async rejectSlip(id: string, note?: string) {
    const slip = await this.prisma.paymentSlipSubmission.findUnique({
      where: { id },
    });
    if (!slip) throw new NotFoundException('Slip not found');

    return this.prisma.paymentSlipSubmission.update({
      where: { id },
      data: {
        status: SlipSubmissionStatus.Rejected,
        reviewedAt: new Date(),
        note: note?.trim() || slip.note,
      },
    });
  }

  /** Logged-in student's own payment history (PayHere orders, subscription, vouchers, slips). */
  async listMyPayments(userId: string) {
    const [orders, unlocks, subscriptions] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { quiz: { select: { id: true, title: true } } },
      }),
      this.prisma.quizUnlock.findMany({
        where: { userId, method: { not: UnlockMethod.PayHere } },
        orderBy: { createdAt: 'desc' },
        include: {
          quiz: { select: { id: true, title: true, priceLkr: true } },
          voucher: true,
          slipSubmission: true,
        },
      }),
      this.prisma.studentSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    type Row = {
      id: string;
      method: 'PayHere' | 'Voucher' | 'Slip' | 'Subscription';
      status: string;
      amountLkr: number | null;
      title: unknown;
      reference: string | null;
      createdAt: Date;
    };

    const rows: Row[] = [];

    for (const order of orders) {
      rows.push({
        id: `order:${order.id}`,
        method: 'PayHere',
        status: order.status,
        amountLkr: Number(order.amountLkr),
        title:
          order.purpose === 'SUBSCRIPTION'
            ? { en: 'Monthly subscription', si: 'මාසික දායකත්වය', ta: 'மாதாந்திர சந்தா' }
            : order.quiz?.title ?? null,
        reference: order.providerPaymentId || order.orderId,
        createdAt: order.createdAt,
      });
    }

    for (const unlock of unlocks) {
      if (unlock.method === UnlockMethod.Voucher) {
        rows.push({
          id: `unlock:${unlock.id}`,
          method: 'Voucher',
          status: 'Unlocked',
          amountLkr: unlock.quiz.priceLkr != null ? Number(unlock.quiz.priceLkr) : null,
          title: unlock.quiz.title,
          reference: unlock.voucher?.code || null,
          createdAt: unlock.createdAt,
        });
      } else if (unlock.method === UnlockMethod.Slip) {
        rows.push({
          id: `unlock:${unlock.id}`,
          method: 'Slip',
          status: 'Approved',
          amountLkr: unlock.quiz.priceLkr != null ? Number(unlock.quiz.priceLkr) : null,
          title: unlock.quiz.title,
          reference: unlock.slipSubmission?.bankReference || null,
          createdAt: unlock.createdAt,
        });
      }
    }

    for (const sub of subscriptions) {
      rows.push({
        id: `sub:${sub.id}`,
        method: 'Subscription',
        status: sub.expiresAt.getTime() > Date.now() ? 'Active' : 'Expired',
        amountLkr: Number(sub.amountLkr),
        title: { en: 'Monthly subscription', si: 'මාසික දායකත්වය', ta: 'மாதாந்திர சந்தா' },
        reference: sub.paymentOrderId,
        createdAt: sub.createdAt,
      });
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const successStatuses = new Set(['Paid', 'Unlocked', 'Approved', 'Active']);
    const lastPayment = rows.find((r) => successStatuses.has(r.status)) ?? null;

    const activeSubscription =
      subscriptions.find((s) => s.expiresAt.getTime() > Date.now()) ?? null;

    return {
      lastPayment,
      history: rows,
      subscription: activeSubscription
        ? { active: true, expiresAt: activeSubscription.expiresAt, startsAt: activeSubscription.startsAt }
        : { active: false, expiresAt: null, startsAt: null },
    };
  }

  /** Unified admin ledger: PayHere orders, vouchers unlocks, bank slips. */
  async listAdminLedger() {
    const [orders, unlocks, slips, guestLeads] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          quiz: { select: { id: true, title: true } },
          user: { select: { id: true, email: true, name: true, phoneNumber: true } },
          unlock: { select: { id: true } },
        },
      }),
      this.prisma.quizUnlock.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          quiz: { select: { id: true, title: true, priceLkr: true } },
          user: { select: { id: true, email: true, name: true, phoneNumber: true } },
          paymentOrder: true,
          voucher: true,
          slipSubmission: true,
        },
      }),
      this.prisma.paymentSlipSubmission.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          quiz: { select: { id: true, title: true, priceLkr: true } },
          user: { select: { id: true, email: true, name: true, phoneNumber: true } },
        },
      }),
      this.prisma.guestLead.findMany({
        select: {
          guestSessionId: true,
          studentName: true,
          school: true,
          mobileNumber: true,
          email: true,
        },
      }),
    ]);

    const leadBySession = new Map(
      guestLeads.map((g) => [g.guestSessionId, g] as const),
    );

    const resolveStudent = (
      account: { id: string; email: string; name: string | null; phoneNumber: string | null } | null | undefined,
      guestSessionId: string | null | undefined,
    ) => {
      const lead = guestSessionId ? leadBySession.get(guestSessionId) : undefined;
      return {
        name: account?.name || lead?.studentName || account?.email || null,
        email: account?.email || lead?.email || null,
        phone: account?.phoneNumber || lead?.mobileNumber || null,
        school: lead?.school || null,
        guestSessionId: guestSessionId || null,
        isAccount: Boolean(account?.id),
      };
    };

    const rows: Array<{
      id: string;
      method: 'PayHere' | 'Voucher' | 'Slip';
      status: string;
      amountLkr: number | null;
      quiz: { id: string; title: unknown };
      user: {
        name: string | null;
        email: string | null;
        phone: string | null;
        school: string | null;
        guestSessionId: string | null;
        isAccount: boolean;
      };
      reference: string | null;
      details: string;
      createdAt: Date;
      refId: string;
    }> = [];

    for (const order of orders) {
      rows.push({
        id: `order:${order.id}`,
        method: 'PayHere',
        status: order.status,
        amountLkr: Number(order.amountLkr),
        quiz: order.quiz ?? {
          id: 'subscription',
          title: { en: 'Monthly subscription', si: '', ta: '' },
        },
        user: resolveStudent(order.user, order.guestSessionId),
        reference: order.providerPaymentId || order.orderId,
        details:
          order.purpose === 'SUBSCRIPTION'
            ? `Subscription ${order.orderId}`
            : `Order ${order.orderId}${order.providerPaymentId ? ` · Pay ${order.providerPaymentId}` : ''}`,
        createdAt: order.createdAt,
        refId: order.id,
      });
    }

    for (const unlock of unlocks) {
      if (unlock.method === UnlockMethod.PayHere) continue; // already in orders
      if (unlock.method === UnlockMethod.Voucher) {
        rows.push({
          id: `unlock:${unlock.id}`,
          method: 'Voucher',
          status: 'Unlocked',
          amountLkr: unlock.quiz.priceLkr != null ? Number(unlock.quiz.priceLkr) : null,
          quiz: unlock.quiz,
          user: resolveStudent(unlock.user, unlock.guestSessionId),
          reference: unlock.voucher?.code || null,
          details: `Code ${unlock.voucher?.code || '—'}`,
          createdAt: unlock.createdAt,
          refId: unlock.id,
        });
      }
      if (unlock.method === UnlockMethod.Slip) {
        rows.push({
          id: `unlock:${unlock.id}`,
          method: 'Slip',
          status: 'Approved',
          amountLkr: unlock.quiz.priceLkr != null ? Number(unlock.quiz.priceLkr) : null,
          quiz: unlock.quiz,
          user: resolveStudent(unlock.user, unlock.guestSessionId),
          reference: unlock.slipSubmission?.bankReference || null,
          details: unlock.slipSubmission?.slipImageUrl || 'Bank slip',
          createdAt: unlock.createdAt,
          refId: unlock.slipSubmissionId || unlock.id,
        });
      }
    }

    for (const slip of slips) {
      if (slip.status === SlipSubmissionStatus.Approved) continue; // covered by unlock
      rows.push({
        id: `slip:${slip.id}`,
        method: 'Slip',
        status: slip.status,
        amountLkr: slip.quiz.priceLkr != null ? Number(slip.quiz.priceLkr) : null,
        quiz: slip.quiz,
        user: resolveStudent(slip.user, slip.guestSessionId),
        reference: slip.bankReference || null,
        details: slip.note || slip.slipImageUrl,
        createdAt: slip.createdAt,
        refId: slip.id,
      });
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows;
  }
}
