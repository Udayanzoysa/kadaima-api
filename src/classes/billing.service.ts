import { createHash, randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ClassEnrollmentStatus,
  ClassFeeFrequency,
  ClassOverdueAccessPolicy,
  ClassProrationPolicy,
  Prisma,
  SlipSubmissionStatus,
  TuitionAdjustmentType,
  TuitionInvoiceStatus,
  TuitionPaymentChannel,
  TuitionPaymentStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  formatPayHereAmount,
  payhereCheckoutHash,
  payhereNotifyHash,
} from '../payments/payhere.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClassesService, RequestActor } from './classes.service';
import {
  ApproveManualPaymentSubmissionDto,
  CreateClassFeePlanDto,
  CreateInvoiceAdjustmentDto,
  CreateInvoiceCheckoutDto,
  CreateManualPaymentSubmissionDto,
  GenerateClassInvoicesDto,
  ListClassInvoicesQueryDto,
  ListManualSubmissionsQueryDto,
  RecordInvoicePaymentDto,
  RefundTuitionPaymentDto,
  RejectManualPaymentSubmissionDto,
  StudentInvoicesQueryDto,
} from './dto/class-billing.dto';

function toJsonOrNull(
  value?: { en?: string; si?: string; ta?: string } | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  const en = value.en?.trim() || '';
  if (!en) return Prisma.JsonNull;
  return {
    en,
    si: value.si?.trim() || en,
    ta: value.ta?.trim() || en,
  } as Prisma.InputJsonValue;
}

function formatStudentDisplayName(u?: {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!u) return 'Unknown';
  return (
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    u.name?.trim() ||
    u.email
  );
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatMinorToMajorString(amountMinor: number): string {
  const safe = Math.trunc(amountMinor || 0);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');
  return `${sign}${major}.${minor}`;
}

/**
 * Pure integer-minor-unit proration calculator.
 * - FULL_MONTH: always returns full `amountMinor`.
 * - PRORATE_BY_DAYS: if `joinedAt` falls within `periodYyyyMm` after day 1,
 *   prorates proportionally by remaining days in that calendar month.
 */
export function computeProratedSubtotalMinor(
  amountMinor: number,
  prorationPolicy: ClassProrationPolicy,
  periodYyyyMm: string,
  joinedAt?: Date | null,
): number {
  const baseMinor = Math.max(0, Math.trunc(amountMinor || 0));
  if (
    prorationPolicy !== ClassProrationPolicy.PRORATE_BY_DAYS ||
    !joinedAt ||
    baseMinor === 0
  ) {
    return baseMinor;
  }

  const [yearStr, monthStr] = periodYyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    return baseMinor;
  }

  const joinedYear = joinedAt.getUTCFullYear();
  const joinedMonth = joinedAt.getUTCMonth() + 1;

  if (joinedYear < year || (joinedYear === year && joinedMonth < month)) {
    return baseMinor;
  }
  if (joinedYear > year || (joinedYear === year && joinedMonth > month)) {
    return 0;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const joinedDay = Math.min(daysInMonth, Math.max(1, joinedAt.getUTCDate()));
  if (joinedDay <= 1) {
    return baseMinor;
  }

  const billableDays = Math.max(1, daysInMonth - joinedDay + 1);
  return Math.round((baseMinor * billableDays) / daysInMonth);
}

export interface ReconcileInvoiceInput {
  subtotalMinor: number;
  discountMinor: number;
  surchargeMinor: number;
  confirmedPaidMinor: number;
  dueAt: Date;
  graceDays: number;
  isVoided?: boolean;
  now?: Date;
}

export interface ReconciledInvoiceFinancials {
  subtotalMinor: number;
  discountMinor: number;
  surchargeMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  status: TuitionInvoiceStatus;
  isOverdue: boolean;
  effectiveDueAt: Date;
}

/**
 * Pure server-side invoice state machine using integer minor units only.
 * - Never marks an invoice PAID unless confirmed allocations cover the full `totalMinor` (with `totalMinor > 0`).
 * - Never treats due-date passage as payment; passing `dueAt + graceDays` with positive balance yields `OVERDUE` (or `PARTIALLY_PAID` with `isOverdue = true`).
 * - Full waiver (`totalMinor === 0 && discountMinor > 0 && paidMinor === 0`) yields `WAIVED`.
 */
export function reconcileInvoiceFinancials(
  input: ReconcileInvoiceInput,
): ReconciledInvoiceFinancials {
  const subtotalMinor = Math.max(0, Math.trunc(input.subtotalMinor || 0));
  const discountMinor = Math.max(0, Math.trunc(input.discountMinor || 0));
  const surchargeMinor = Math.max(0, Math.trunc(input.surchargeMinor || 0));
  const paidMinor = Math.max(0, Math.trunc(input.confirmedPaidMinor || 0));

  const totalMinor = Math.max(0, subtotalMinor + surchargeMinor - discountMinor);
  const isVoided = Boolean(input.isVoided);
  const balanceMinor = isVoided ? 0 : Math.max(0, totalMinor - paidMinor);

  const graceMs = Math.max(0, Math.trunc(input.graceDays || 0)) * 86_400_000;
  const effectiveDueAt = new Date(input.dueAt.getTime() + graceMs);
  const now = input.now ?? new Date();
  const isOverdue =
    !isVoided && balanceMinor > 0 && now.getTime() > effectiveDueAt.getTime();

  let status: TuitionInvoiceStatus;
  if (isVoided) {
    status = TuitionInvoiceStatus.VOIDED;
  } else if (totalMinor === 0 && discountMinor > 0 && paidMinor === 0) {
    status = TuitionInvoiceStatus.WAIVED;
  } else if (balanceMinor === 0 && totalMinor > 0 && paidMinor >= totalMinor) {
    status = TuitionInvoiceStatus.PAID;
  } else if (paidMinor > 0 && balanceMinor > 0) {
    status = TuitionInvoiceStatus.PARTIALLY_PAID;
  } else if (isOverdue) {
    status = TuitionInvoiceStatus.OVERDUE;
  } else {
    status = TuitionInvoiceStatus.ISSUED;
  }

  return {
    subtotalMinor,
    discountMinor,
    surchargeMinor,
    totalMinor,
    paidMinor,
    balanceMinor,
    status,
    isOverdue,
    effectiveDueAt,
  };
}

function buildDueDateUtc(periodYyyyMm: string, dueDay: number): Date {
  const [yearStr, monthStr] = periodYyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const clampedDay = Math.min(28, Math.max(1, Math.trunc(dueDay || 10)));
  // End of due day in Asia/Colombo (23:59:59+05:30 = 18:29:59Z)
  return new Date(Date.UTC(year, month - 1, clampedDay, 18, 29, 59, 0));
}

function generateInvoiceNumber(
  periodYyyyMm: string,
  classId: string,
  studentId: string,
): string {
  const periodCompact = periodYyyyMm.replace('-', '');
  const cShort = classId.replace(/-/g, '').slice(0, 4).toUpperCase();
  const sShort = studentId.replace(/-/g, '').slice(0, 4).toUpperCase();
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `INV-${periodCompact}-${cShort}-${sShort}-${rand}`;
}

export function generateTuitionOrderId(invoiceId: string): string {
  const short = invoiceId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `TUI-${short}-${ts}-${rand}`.slice(0, 64);
}

export function generateReceiptNumber(paymentId: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const pShort = paymentId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `RCP-${ym}-${pShort}-${rand}`;
}

function isConfirmedPaymentStatus(status?: TuitionPaymentStatus | null): boolean {
  return (
    status === TuitionPaymentStatus.SUCCEEDED ||
    status === TuitionPaymentStatus.PARTIALLY_REFUNDED
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTuitionReceiptHtml(snapshot: Record<string, any>): string {
  const receiptNumber = escapeHtml(snapshot.receiptNumber || '');
  const invoiceNumber = escapeHtml(snapshot.invoiceNumber || '');
  const periodYyyyMm = escapeHtml(snapshot.periodYyyyMm || '');
  const studentName = escapeHtml(snapshot.studentName || 'Student');
  const studentEmail = escapeHtml(snapshot.studentEmail || '');
  const studentCode = escapeHtml(snapshot.studentCode || '');
  const classTitle = escapeHtml(snapshot.classTitle || 'Class Batch');
  const teacherName = escapeHtml(snapshot.teacherName || 'Teacher');
  const currency = escapeHtml(snapshot.currency || 'LKR');
  const channel = escapeHtml(snapshot.channel || '');
  const externalReference = escapeHtml(snapshot.externalReference || '—');
  const paidAmount = escapeHtml(
    `${currency} ${formatMinorToMajorString(Number(snapshot.paidAmountMinor || 0))}`,
  );
  const balanceAfter = escapeHtml(
    `${currency} ${formatMinorToMajorString(Number(snapshot.balanceAfterMinor || 0))}`,
  );
  const invoiceTotal = escapeHtml(
    `${currency} ${formatMinorToMajorString(Number(snapshot.invoiceTotalMinor || 0))}`,
  );
  const issuedAt = escapeHtml(
    snapshot.issuedAt ? new Date(snapshot.issuedAt).toUTCString() : '',
  );
  const statusBadge = escapeHtml(snapshot.receiptStatus || 'ISSUED');
  const testModeBanner = snapshot.isTestMode
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-weight:600;font-size:13px;">TEST MODE RECEIPT — Generated in Sandbox / Explicit Test Mode</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tuition Receipt ${receiptNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 24px; }
    .card { max-width: 680px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: #dcfce7; color: #166534; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; font-size: 14px; margin-bottom: 20px; }
    .label { color: #6b7280; font-size: 12px; margin-bottom: 2px; }
    .val { font-weight: 600; }
    .totals { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 12px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .row.highlight { font-size: 16px; font-weight: 700; color: #047857; }
    @media print { .no-print { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="card">
    ${testModeBanner}
    <div class="header">
      <div>
        <h1 class="title">Kadaima LMS — Official Tuition Receipt</h1>
        <div class="subtitle">Receipt No: ${receiptNumber} &bull; Issued: ${issuedAt}</div>
      </div>
      <span class="badge">${statusBadge}</span>
    </div>
    <div class="grid">
      <div>
        <div class="label">Student</div>
        <div class="val">${studentName} ${studentCode ? `(${studentCode})` : ''}</div>
        <div class="subtitle">${studentEmail}</div>
      </div>
      <div>
        <div class="label">Class / Batch</div>
        <div class="val">${classTitle}</div>
        <div class="subtitle">Instructor: ${teacherName}</div>
      </div>
      <div>
        <div class="label">Invoice &amp; Billing Period</div>
        <div class="val">${invoiceNumber} (${periodYyyyMm})</div>
      </div>
      <div>
        <div class="label">Payment Method &amp; Reference</div>
        <div class="val">${channel} &bull; ${externalReference}</div>
      </div>
    </div>
    <div class="totals">
      <div class="row"><span>Invoice Net Total</span><span>${invoiceTotal}</span></div>
      <div class="row highlight"><span>Confirmed Amount Paid</span><span>${paidAmount}</span></div>
      <div class="row"><span>Remaining Balance After Payment</span><span>${balanceAfter}</span></div>
    </div>
  </div>
</body>
</html>`;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
    private readonly auditService: AuditService,
  ) {}

  async createFeePlan(
    classId: string,
    dto: CreateClassFeePlanDto,
    actor: RequestActor,
  ) {
    await this.classesService.requireWriteAccess(classId, actor);

    const currency = (dto.currency || 'LKR').trim().toUpperCase();
    const frequency = dto.frequency ?? ClassFeeFrequency.MONTHLY;
    const dueDay = dto.dueDay ?? 10;
    const graceDays = dto.graceDays ?? 5;
    const prorationPolicy =
      dto.prorationPolicy ?? ClassProrationPolicy.FULL_MONTH;
    const overdueAccessPolicy =
      dto.overdueAccessPolicy ?? ClassOverdueAccessPolicy.ALLOW_WITH_WARNING;
    const activeFrom = dto.activeFrom ? new Date(dto.activeFrom) : new Date();
    const activeTo = dto.activeTo ? new Date(dto.activeTo) : null;

    if (
      activeTo &&
      !Number.isNaN(activeTo.getTime()) &&
      activeFrom.getTime() >= activeTo.getTime()
    ) {
      throw new BadRequestException('activeFrom must be earlier than activeTo.');
    }

    const existingPlans = await this.prisma.classFeePlan.findMany({
      where: { classId },
      orderBy: [{ version: 'desc' }],
      take: 1,
    });
    const nextVersion = (existingPlans[0]?.version ?? 0) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.classFeePlan.updateMany({
        where: { classId, isActive: true },
        data: { isActive: false, activeTo: new Date() },
      });

      const plan = await tx.classFeePlan.create({
        data: {
          classId,
          name: toJsonOrNull(dto.name),
          version: nextVersion,
          amountMinor: Math.trunc(dto.amountMinor),
          currency,
          frequency,
          dueDay,
          graceDays,
          prorationPolicy,
          overdueAccessPolicy,
          activeFrom,
          activeTo,
          isActive: true,
          createdById: actor.id,
        },
      });

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId,
          actorId: actor.id,
          action: 'FEE_PLAN_CREATED',
          previousValues: existingPlans[0]
            ? ({
                planId: existingPlans[0].id,
                version: existingPlans[0].version,
                amountMinor: existingPlans[0].amountMinor,
              } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          newValues: {
            planId: plan.id,
            version: plan.version,
            amountMinor: plan.amountMinor,
            currency: plan.currency,
            frequency: plan.frequency,
            dueDay: plan.dueDay,
            graceDays: plan.graceDays,
            prorationPolicy: plan.prorationPolicy,
            overdueAccessPolicy: plan.overdueAccessPolicy,
          } as Prisma.InputJsonValue,
          reason: `Created fee plan v${nextVersion}`,
        },
      });

      return plan;
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Created class fee plan v${created.version} (${created.currency} ${formatMinorToMajorString(created.amountMinor)})`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return created;
  }

  async listFeePlans(classId: string, actor: RequestActor) {
    await this.classesService.requireTeacherReadAccess(classId, actor);

    const plans = await this.prisma.classFeePlan.findMany({
      where: { classId },
      orderBy: [{ version: 'desc' }],
    });

    const activePlan = plans.find((p) => p.isActive) || null;
    return {
      classId,
      activePlan,
      history: plans,
    };
  }

  /**
   * Idempotently generates monthly tuition invoices for eligible ACTIVE students in a class batch.
   * - Never duplicates an invoice for `(enrollmentId, periodYyyyMm)`.
   * - Snapshots the active fee planonto `planSnapshotJson` and `subtotalMinor` so later fee plan changes
   *   never rewrite issued or settled invoices.
   */
  async generateClassInvoices(
    classId: string,
    dto: GenerateClassInvoicesDto,
    actor: RequestActor,
  ) {
    await this.classesService.requireWriteAccess(classId, actor);

    const activePlan = await this.prisma.classFeePlan.findFirst({
      where: { classId, isActive: true },
      orderBy: [{ version: 'desc' }],
    });
    if (!activePlan) {
      throw new BadRequestException(
        'No active fee plan found for this class batch. Create a fee plan before generating monthly invoices.',
      );
    }

    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        classId,
        status: ClassEnrollmentStatus.ACTIVE,
        ...(dto.studentIds?.length
          ? { studentId: { in: dto.studentIds } }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const existingInvoices = await this.prisma.tuitionInvoice.findMany({
      where: {
        classId,
        periodYyyyMm: dto.periodYyyyMm,
      },
      select: {
        id: true,
        enrollmentId: true,
        studentId: true,
      },
    });

    const existingByEnrollment = new Set(
      existingInvoices.map((inv) => inv.enrollmentId),
    );
    const existingByStudent = new Set(
      existingInvoices.map((inv) => inv.studentId),
    );

    const dueAt = buildDueDateUtc(dto.periodYyyyMm, activePlan.dueDay);
    const planSnapshot: Prisma.InputJsonValue = {
      planId: activePlan.id,
      version: activePlan.version,
      amountMinor: activePlan.amountMinor,
      currency: activePlan.currency,
      frequency: activePlan.frequency,
      dueDay: activePlan.dueDay,
      graceDays: activePlan.graceDays,
      prorationPolicy: activePlan.prorationPolicy,
      overdueAccessPolicy: activePlan.overdueAccessPolicy,
    };

    let createdCount = 0;
    let skippedExistingCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const enrollment of enrollments) {
        if (
          existingByEnrollment.has(enrollment.id) ||
          existingByStudent.has(enrollment.studentId)
        ) {
          skippedExistingCount += 1;
          continue;
        }

        const subtotalMinor = computeProratedSubtotalMinor(
          activePlan.amountMinor,
          activePlan.prorationPolicy,
          dto.periodYyyyMm,
          enrollment.joinedAt,
        );

        const reconciled = reconcileInvoiceFinancials({
          subtotalMinor,
          discountMinor: 0,
          surchargeMinor: 0,
          confirmedPaidMinor: 0,
          dueAt,
          graceDays: activePlan.graceDays,
        });

        const invoiceNumber = generateInvoiceNumber(
          dto.periodYyyyMm,
          classId,
          enrollment.studentId,
        );

        const upserted = await tx.tuitionInvoice.upsert({
          where: {
            enrollmentId_periodYyyyMm: {
              enrollmentId: enrollment.id,
              periodYyyyMm: dto.periodYyyyMm,
            },
          },
          create: {
            classId,
            enrollmentId: enrollment.id,
            studentId: enrollment.studentId,
            feePlanId: activePlan.id,
            periodYyyyMm: dto.periodYyyyMm,
            invoiceNumber,
            currency: activePlan.currency,
            subtotalMinor: reconciled.subtotalMinor,
            discountMinor: 0,
            surchargeMinor: 0,
            totalMinor: reconciled.totalMinor,
            paidMinor: 0,
            balanceMinor: reconciled.balanceMinor,
            dueAt,
            graceDays: activePlan.graceDays,
            status: reconciled.status,
            planSnapshotJson: planSnapshot,
            notes: dto.notes?.trim() || null,
          },
          update: {}, // Idempotent no-op if concurrent job already inserted
        });

        createdCount += 1;
        existingByEnrollment.add(enrollment.id);
        existingByStudent.add(enrollment.studentId);

        await tx.tuitionBillingAuditEvent.create({
          data: {
            classId,
            invoiceId: upserted.id,
            actorId: actor.id,
            action: 'INVOICE_GENERATED',
            newValues: {
              invoiceNumber: upserted.invoiceNumber,
              periodYyyyMm: dto.periodYyyyMm,
              subtotalMinor: upserted.subtotalMinor,
              totalMinor: upserted.totalMinor,
              feePlanVersion: activePlan.version,
            } as Prisma.InputJsonValue,
            reason: `Generated monthly invoice for ${dto.periodYyyyMm}`,
          },
        });
      }
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: classId,
      description: `Generated ${createdCount} invoice(s) for ${dto.periodYyyyMm} (${skippedExistingCount} already existed)`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    const ledger = await this.listClassInvoices(
      classId,
      { period: dto.periodYyyyMm },
      actor,
    );

    return {
      periodYyyyMm: dto.periodYyyyMm,
      createdCount,
      skippedExistingCount,
      ...ledger,
    };
  }

  private formatInvoiceForResponse(inv: any, now = new Date()) {
    const confirmedPaidMinor = Array.isArray(inv.allocations)
      ? inv.allocations.reduce((sum: number, alloc: any) => {
          if (isConfirmedPaymentStatus(alloc.payment?.status)) {
            return sum + (alloc.amountMinor || 0);
          }
          return sum;
        }, 0)
      : inv.paidMinor || 0;

    const pendingMinor = Array.isArray(inv.allocations)
      ? inv.allocations.reduce((sum: number, alloc: any) => {
          if (alloc.payment?.status === TuitionPaymentStatus.PENDING) {
            return sum + (alloc.amountMinor || 0);
          }
          return sum;
        }, 0)
      : 0;

    const reconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: new Date(inv.dueAt),
      graceDays: inv.graceDays ?? 5,
      isVoided: inv.status === TuitionInvoiceStatus.VOIDED,
      now,
    });

    return {
      id: inv.id,
      classId: inv.classId,
      classTitle: (inv.classBatch?.title as Record<string, string>) || null,
      grade: inv.classBatch?.grade ?? null,
      subject: inv.classBatch?.subject ?? null,
      enrollmentId: inv.enrollmentId,
      studentId: inv.studentId,
      studentName: inv.student ? formatStudentDisplayName(inv.student) : null,
      studentEmail: inv.student?.email ?? null,
      studentCode: inv.enrollment?.studentCode ?? null,
      feePlanId: inv.feePlanId,
      periodYyyyMm: inv.periodYyyyMm,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      subtotalMinor: reconciled.subtotalMinor,
      discountMinor: reconciled.discountMinor,
      surchargeMinor: reconciled.surchargeMinor,
      totalMinor: reconciled.totalMinor,
      paidMinor: reconciled.paidMinor,
      pendingMinor,
      balanceMinor: reconciled.balanceMinor,
      dueAt: new Date(inv.dueAt).toISOString(),
      effectiveDueAt: reconciled.effectiveDueAt.toISOString(),
      graceDays: inv.graceDays ?? 5,
      status: reconciled.status,
      isOverdue: reconciled.isOverdue,
      planSnapshot: inv.planSnapshotJson,
      notes: inv.notes,
      issuedAt: new Date(inv.issuedAt).toISOString(),
      paidAt: inv.paidAt ? new Date(inv.paidAt).toISOString() : null,
      voidedAt: inv.voidedAt ? new Date(inv.voidedAt).toISOString() : null,
      adjustments: Array.isArray(inv.adjustments)
        ? inv.adjustments.map((adj: any) => ({
            id: adj.id,
            type: adj.type,
            amountMinor: adj.amountMinor,
            reason: adj.reason,
            actorName: adj.actor ? formatStudentDisplayName(adj.actor) : null,
            createdAt: new Date(adj.createdAt).toISOString(),
          }))
        : [],
      payments: Array.isArray(inv.allocations)
        ? inv.allocations.map((alloc: any) => ({
            allocationId: alloc.id,
            paymentId: alloc.paymentId,
            allocatedMinor: alloc.amountMinor,
            grossAmountMinor: alloc.payment?.amountMinor ?? alloc.amountMinor,
            refundedMinor: alloc.payment?.refundedMinor ?? 0,
            channel: alloc.payment?.channel ?? null,
            gateway: alloc.payment?.gateway ?? null,
            providerOrderId: alloc.payment?.providerOrderId ?? null,
            isTestMode: Boolean(alloc.payment?.isTestMode),
            status: alloc.payment?.status ?? null,
            externalReference: alloc.payment?.externalReference ?? null,
            receiptNumber: alloc.payment?.receipt?.receiptNumber ?? null,
            receiptId: alloc.payment?.receipt?.id ?? null,
            confirmedAt: alloc.payment?.confirmedAt
              ? new Date(alloc.payment.confirmedAt).toISOString()
              : null,
            refundedAt: alloc.payment?.refundedAt
              ? new Date(alloc.payment.refundedAt).toISOString()
              : null,
            refundReason: alloc.payment?.refundReason ?? null,
            createdAt: new Date(alloc.createdAt).toISOString(),
          }))
        : [],
      manualSubmissions: Array.isArray(inv.manualSubmissions)
        ? inv.manualSubmissions.map((sub: any) => ({
            id: sub.id,
            paymentId: sub.paymentId,
            channel: sub.channel,
            amountMinor: sub.amountMinor,
            referenceNumber: sub.referenceNumber,
            paidDate: sub.paidDate
              ? new Date(sub.paidDate).toISOString().slice(0, 10)
              : null,
            note: sub.note ?? null,
            status: sub.status,
            reviewReason: sub.reviewReason ?? null,
            reviewedAt: sub.reviewedAt
              ? new Date(sub.reviewedAt).toISOString()
              : null,
            createdAt: new Date(sub.createdAt).toISOString(),
          }))
        : [],
    };
  }

  async listClassInvoices(
    classId: string,
    query: ListClassInvoicesQueryDto,
    actor: RequestActor,
  ) {
    const batch = await this.classesService.requireTeacherReadAccess(
      classId,
      actor,
    );

    const activePlan = await this.prisma.classFeePlan.findFirst({
      where: { classId, isActive: true },
      orderBy: [{ version: 'desc' }],
    });

    const invoices = await this.prisma.tuitionInvoice.findMany({
      where: {
        classId,
        ...(query.period ? { periodYyyyMm: query.period } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        enrollment: {
          select: {
            id: true,
            studentCode: true,
            status: true,
          },
        },
        adjustments: {
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        allocations: {
          include: {
            payment: {
              include: {
                receipt: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        manualSubmissions: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
      orderBy: [{ periodYyyyMm: 'desc' }, { createdAt: 'asc' }],
    });

    const now = new Date();
    let formatted = invoices.map((inv) =>
      this.formatInvoiceForResponse(inv, now),
    );

    if (query.status) {
      formatted = formatted.filter((inv) => inv.status === query.status);
    }

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      formatted = formatted.filter(
        (inv) =>
          (inv.studentName || '').toLowerCase().includes(q) ||
          (inv.studentEmail || '').toLowerCase().includes(q) ||
          (inv.studentCode || '').toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q),
      );
    }

    let invoicedTotalMinor = 0;
    let discountTotalMinor = 0;
    let paidTotalMinor = 0;
    let outstandingTotalMinor = 0;
    let paidCount = 0;
    let partiallyPaidCount = 0;
    let unpaidCount = 0;
    let overdueCount = 0;
    let waivedCount = 0;
    let voidedCount = 0;

    for (const inv of formatted) {
      if (inv.status !== TuitionInvoiceStatus.VOIDED) {
        invoicedTotalMinor += inv.totalMinor;
        discountTotalMinor += inv.discountMinor;
        paidTotalMinor += inv.paidMinor;
        outstandingTotalMinor += inv.balanceMinor;
      }

      if (inv.status === TuitionInvoiceStatus.PAID) paidCount += 1;
      else if (inv.status === TuitionInvoiceStatus.PARTIALLY_PAID) {
        partiallyPaidCount += 1;
        if (inv.isOverdue) overdueCount += 1;
      } else if (inv.status === TuitionInvoiceStatus.OVERDUE) overdueCount += 1;
      else if (inv.status === TuitionInvoiceStatus.WAIVED) waivedCount += 1;
      else if (inv.status === TuitionInvoiceStatus.VOIDED) voidedCount += 1;
      else unpaidCount += 1;
    }

    return {
      classId,
      classTitle: batch.title as Record<string, string>,
      period: query.period || null,
      currency: activePlan?.currency || 'LKR',
      activeFeePlan: activePlan,
      summary: {
        totalInvoices: formatted.length,
        invoicedTotalMinor,
        discountTotalMinor,
        paidTotalMinor,
        outstandingTotalMinor,
        paidCount,
        partiallyPaidCount,
        unpaidCount,
        overdueCount,
        waivedCount,
        voidedCount,
      },
      invoices: formatted,
    };
  }

  async exportClassInvoicesCsv(
    classId: string,
    query: ListClassInvoicesQueryDto,
    actor: RequestActor,
  ): Promise<{ fileName: string; csv: string }> {
    const ledger = await this.listClassInvoices(classId, query, actor);

    const headers = [
      'Invoice Number',
      'Period (YYYY-MM)',
      'Student Name',
      'Email',
      'Student Code',
      'Currency',
      'Subtotal',
      'Discount / Waiver',
      'Total Due',
      'Confirmed Paid',
      'Outstanding Balance',
      'Status',
      'Due Date',
      'Paid Date',
    ];

    const rows = ledger.invoices.map((inv) => [
      inv.invoiceNumber,
      inv.periodYyyyMm,
      inv.studentName || '',
      inv.studentEmail || '',
      inv.studentCode || '',
      inv.currency,
      formatMinorToMajorString(inv.subtotalMinor),
      formatMinorToMajorString(inv.discountMinor),
      formatMinorToMajorString(inv.totalMinor),
      formatMinorToMajorString(inv.paidMinor),
      formatMinorToMajorString(inv.balanceMinor),
      inv.status,
      inv.dueAt.slice(0, 10),
      inv.paidAt ? inv.paidAt.slice(0, 10) : '',
    ]);

    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ];

    const periodSuffix = query.period || 'all';
    const safeCode = classId.slice(0, 8).replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      fileName: `tuition-ledger-${safeCode}-${periodSuffix}.csv`,
      csv: lines.join('\r\n'),
    };
  }

  async getInvoiceById(invoiceId: string, actor: RequestActor) {
    const inv = await this.prisma.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        classBatch: {
          select: {
            id: true,
            title: true,
            grade: true,
            subject: true,
          },
        },
        student: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        enrollment: {
          select: {
            id: true,
            studentCode: true,
            status: true,
          },
        },
        adjustments: {
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        allocations: {
          include: {
            payment: {
              include: {
                receipt: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        manualSubmissions: {
          orderBy: [{ createdAt: 'desc' }],
        },
        auditEvents: {
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
        },
      },
    });

    if (!inv) {
      throw new NotFoundException('Tuition invoice not found.');
    }

    // Student can view only their own invoice; teachers must have read access on the class batch
    if (inv.studentId !== actor.id) {
      await this.classesService.requireTeacherReadAccess(inv.classId, actor);
    }

    const formatted = this.formatInvoiceForResponse(inv);
    return {
      ...formatted,
      auditEvents: inv.auditEvents.map((ev) => ({
        id: ev.id,
        action: ev.action,
        previousValues: ev.previousValues,
        newValues: ev.newValues,
        reason: ev.reason,
        actorName: ev.actor ? formatStudentDisplayName(ev.actor) : null,
        createdAt: ev.createdAt.toISOString(),
      })),
    };
  }

  async createInvoiceAdjustment(
    invoiceId: string,
    dto: CreateInvoiceAdjustmentDto,
    actor: RequestActor,
  ) {
    const inv = await this.prisma.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        adjustments: true,
        allocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!inv) {
      throw new NotFoundException('Tuition invoice not found.');
    }

    await this.classesService.requireWriteAccess(inv.classId, actor);

    if (inv.status === TuitionInvoiceStatus.VOIDED) {
      throw new BadRequestException('Cannot adjust a voided invoice.');
    }

    const confirmedPaidMinor = inv.allocations.reduce((sum, alloc) => {
      if (isConfirmedPaymentStatus(alloc.payment?.status)) {
        return sum + alloc.amountMinor;
      }
      return sum;
    }, 0);

    const currentReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
    });

    if (
      currentReconciled.status === TuitionInvoiceStatus.PAID &&
      dto.type !== TuitionAdjustmentType.SURCHARGE
    ) {
      throw new BadRequestException(
        'Cannot apply a discount, waiver, or void to an already paid invoice.',
      );
    }

    if (dto.type === TuitionAdjustmentType.VOID) {
      if (confirmedPaidMinor > 0) {
        throw new BadRequestException(
          'Cannot void an invoice that already has confirmed payments.',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.tuitionInvoiceAdjustment.create({
          data: {
            invoiceId,
            type: TuitionAdjustmentType.VOID,
            amountMinor: currentReconciled.balanceMinor,
            reason: dto.reason.trim(),
            actorId: actor.id,
          },
        });

        await tx.tuitionInvoice.update({
          where: { id: invoiceId },
          data: {
            status: TuitionInvoiceStatus.VOIDED,
            balanceMinor: 0,
            voidedAt: new Date(),
          },
        });

        await tx.tuitionBillingAuditEvent.create({
          data: {
            classId: inv.classId,
            invoiceId,
            actorId: actor.id,
            action: 'INVOICE_VOIDED',
            previousValues: {
              status: inv.status,
              balanceMinor: inv.balanceMinor,
            } as Prisma.InputJsonValue,
            newValues: {
              status: TuitionInvoiceStatus.VOIDED,
              balanceMinor: 0,
            } as Prisma.InputJsonValue,
            reason: dto.reason.trim(),
          },
        });
      });

      return this.getInvoiceById(invoiceId, actor);
    }

    let adjustmentAmountMinor = Math.trunc(dto.amountMinor ?? 0);
    if (dto.type === TuitionAdjustmentType.WAIVER && adjustmentAmountMinor <= 0) {
      adjustmentAmountMinor = currentReconciled.balanceMinor;
    }

    if (adjustmentAmountMinor <= 0) {
      throw new BadRequestException(
        'Adjustment amountMinor must be greater than 0.',
      );
    }

    let nextDiscountMinor = inv.discountMinor;
    let nextSurchargeMinor = inv.surchargeMinor;

    if (
      dto.type === TuitionAdjustmentType.DISCOUNT ||
      dto.type === TuitionAdjustmentType.WAIVER
    ) {
      if (adjustmentAmountMinor > currentReconciled.balanceMinor) {
        throw new BadRequestException(
          'Discount or waiver cannot exceed the remaining unpaid balance of the invoice.',
        );
      }
      nextDiscountMinor += adjustmentAmountMinor;
    } else if (dto.type === TuitionAdjustmentType.SURCHARGE) {
      nextSurchargeMinor += adjustmentAmountMinor;
    }

    const nextReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: nextDiscountMinor,
      surchargeMinor: nextSurchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.tuitionInvoiceAdjustment.create({
        data: {
          invoiceId,
          type: dto.type,
          amountMinor: adjustmentAmountMinor,
          reason: dto.reason.trim(),
          actorId: actor.id,
        },
      });

      await tx.tuitionInvoice.update({
        where: { id: invoiceId },
        data: {
          discountMinor: nextReconciled.discountMinor,
          surchargeMinor: nextReconciled.surchargeMinor,
          totalMinor: nextReconciled.totalMinor,
          paidMinor: nextReconciled.paidMinor,
          balanceMinor: nextReconciled.balanceMinor,
          status: nextReconciled.status,
        },
      });

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId,
          actorId: actor.id,
          action: `INVOICE_ADJUSTMENT_${dto.type}`,
          previousValues: {
            discountMinor: inv.discountMinor,
            surchargeMinor: inv.surchargeMinor,
            totalMinor: inv.totalMinor,
            balanceMinor: inv.balanceMinor,
            status: inv.status,
          } as Prisma.InputJsonValue,
          newValues: {
            discountMinor: nextReconciled.discountMinor,
            surchargeMinor: nextReconciled.surchargeMinor,
            totalMinor: nextReconciled.totalMinor,
            balanceMinor: nextReconciled.balanceMinor,
            status: nextReconciled.status,
          } as Prisma.InputJsonValue,
          reason: dto.reason.trim(),
        },
      });
    });

    return this.getInvoiceById(invoiceId, actor);
  }

  /**
   * Records a partial or full tuition payment allocation on an invoice.
   * - CRITICAL SECURITY INVARIANT: Only an authorized teacher/admin with write access on `inv.classId`
   *   can record a confirmed (`SUCCEEDED`) payment. Students can never mark an invoice paid!
   * - A `PENDING` payment never reduces `balanceMinor` or transitions the invoice to `PAID` / `PARTIALLY_PAID`.
   */
  async recordInvoicePayment(
    invoiceId: string,
    dto: RecordInvoicePaymentDto,
    actor: RequestActor,
  ) {
    const inv = await this.prisma.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        classBatch: {
          select: {
            id: true,
            title: true,
            primaryTeacher: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        enrollment: {
          select: {
            id: true,
            studentCode: true,
          },
        },
        allocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!inv) {
      throw new NotFoundException('Tuition invoice not found.');
    }

    const desiredStatus = dto.status ?? TuitionPaymentStatus.SUCCEEDED;

    if (desiredStatus === TuitionPaymentStatus.SUCCEEDED) {
      // Only an authorized teacher/admin can confirm funds!
      await this.classesService.requireWriteAccess(inv.classId, actor);
    } else if (desiredStatus === TuitionPaymentStatus.PENDING) {
      if (inv.studentId !== actor.id) {
        await this.classesService.requireWriteAccess(inv.classId, actor);
      }
    } else {
      throw new BadRequestException(
        'Invalid initial payment status. Must be SUCCEEDED (teacher-verified) or PENDING.',
      );
    }

    if (
      inv.status === TuitionInvoiceStatus.VOIDED ||
      inv.status === TuitionInvoiceStatus.WAIVED
    ) {
      throw new BadRequestException(
        `Cannot allocate payment to a ${inv.status.toLowerCase()} invoice.`,
      );
    }

    const confirmedPaidMinor = inv.allocations.reduce((sum, alloc) => {
      if (isConfirmedPaymentStatus(alloc.payment?.status)) {
        return sum + alloc.amountMinor;
      }
      return sum;
    }, 0);

    const currentReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
    });

    const amountMinor = Math.trunc(dto.amountMinor);
    if (amountMinor <= 0) {
      throw new BadRequestException('Payment amountMinor must be positive.');
    }
    if (amountMinor > currentReconciled.balanceMinor) {
      throw new BadRequestException(
        'Payment amountMinor cannot exceed the invoice outstanding balance.',
      );
    }

    const now = new Date();
    const isConfirmed = desiredStatus === TuitionPaymentStatus.SUCCEEDED;
    const nextConfirmedPaidMinor = isConfirmed
      ? confirmedPaidMinor + amountMinor
      : confirmedPaidMinor;

    const nextReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor: nextConfirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      now,
    });

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.tuitionPayment.create({
        data: {
          classId: inv.classId,
          payerId: inv.studentId,
          channel: dto.channel ?? TuitionPaymentChannel.CASH,
          externalReference: dto.externalReference?.trim() || null,
          currency: inv.currency,
          amountMinor,
          status: desiredStatus,
          notes: dto.notes?.trim() || null,
          verifiedById: isConfirmed ? actor.id : null,
          confirmedAt: isConfirmed ? now : null,
        },
      });

      await tx.tuitionPaymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId,
          amountMinor,
        },
      });

      if (isConfirmed) {
        await tx.tuitionInvoice.update({
          where: { id: invoiceId },
          data: {
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            status: nextReconciled.status,
            paidAt:
              nextReconciled.status === TuitionInvoiceStatus.PAID
                ? now
                : inv.paidAt,
          },
        });

        if ((tx as any).tuitionReceipt) {
          const receiptNumber = generateReceiptNumber(payment.id);
          const classTitleObj = (inv.classBatch?.title as Record<string, string>) || {};
          await (tx as any).tuitionReceipt.create({
            data: {
              receiptNumber,
              paymentId: payment.id,
              invoiceId: inv.id,
              classId: inv.classId,
              studentId: inv.studentId,
              currency: inv.currency,
              paidAmountMinor: amountMinor,
              balanceAfterMinor: nextReconciled.balanceMinor,
              status: 'ISSUED',
              snapshotJson: {
                receiptNumber,
                invoiceNumber: inv.invoiceNumber,
                periodYyyyMm: inv.periodYyyyMm,
                studentName: formatStudentDisplayName(inv.student),
                studentEmail: inv.student?.email || '',
                studentCode: inv.enrollment?.studentCode || '',
                classTitle: classTitleObj.en || classTitleObj.si || classTitleObj.ta || 'Class Batch',
                teacherName: formatStudentDisplayName(inv.classBatch?.primaryTeacher),
                currency: inv.currency,
                channel: dto.channel ?? TuitionPaymentChannel.CASH,
                externalReference: dto.externalReference?.trim() || 'Teacher Direct Verification',
                invoiceTotalMinor: nextReconciled.totalMinor,
                paidAmountMinor: amountMinor,
                balanceAfterMinor: nextReconciled.balanceMinor,
                receiptStatus: 'ISSUED',
                isTestMode: false,
                issuedAt: now.toISOString(),
              } as Prisma.InputJsonValue,
              issuedAt: now,
            },
          });
        }
      }

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId,
          actorId: actor.id,
          action: isConfirmed
            ? 'PAYMENT_CONFIRMED_ALLOCATED'
            : 'PAYMENT_PENDING_SUBMITTED',
          previousValues: {
            paidMinor: inv.paidMinor,
            balanceMinor: inv.balanceMinor,
            status: inv.status,
          } as Prisma.InputJsonValue,
          newValues: {
            paymentId: payment.id,
            amountMinor,
            paymentStatus: desiredStatus,
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            invoiceStatus: nextReconciled.status,
          } as Prisma.InputJsonValue,
          reason: dto.notes?.trim() || `Payment (${desiredStatus})`,
        },
      });
    });

    return this.getInvoiceById(invoiceId, actor);
  }

  async getStudentInvoices(
    actor: RequestActor,
    query: StudentInvoicesQueryDto,
  ) {
    if (query.classId) {
      const enrollment = await this.prisma.classEnrollment.findUnique({
        where: {
          classId_studentId: {
            classId: query.classId,
            studentId: actor.id,
          },
        },
      });
      if (!enrollment) {
        throw new ForbiddenException(
          'You are not enrolled in this class batch.',
        );
      }
    }

    const invoices = await this.prisma.tuitionInvoice.findMany({
      where: {
        studentId: actor.id,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.period ? { periodYyyyMm: query.period } : {}),
      },
      include: {
        classBatch: {
          select: {
            id: true,
            title: true,
            grade: true,
            subject: true,
          },
        },
        enrollment: {
          select: {
            id: true,
            studentCode: true,
            status: true,
          },
        },
        adjustments: {
          orderBy: [{ createdAt: 'desc' }],
        },
        allocations: {
          include: {
            payment: {
              include: {
                receipt: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        manualSubmissions: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
      orderBy: [{ periodYyyyMm: 'desc' }, { dueAt: 'desc' }],
    });

    const now = new Date();
    const formatted = invoices.map((inv) =>
      this.formatInvoiceForResponse(inv, now),
    );

    let totalDueMinor = 0;
    let totalPaidMinor = 0;
    let overdueCount = 0;

    for (const inv of formatted) {
      if (inv.status !== TuitionInvoiceStatus.VOIDED) {
        totalDueMinor += inv.balanceMinor;
        totalPaidMinor += inv.paidMinor;
        if (inv.isOverdue) overdueCount += 1;
      }
    }

    return {
      studentId: actor.id,
      currency: formatted[0]?.currency || 'LKR',
      summary: {
        invoiceCount: formatted.length,
        totalDueMinor,
        totalPaidMinor,
        overdueCount,
      },
      invoices: formatted,
    };
  }

  // ============================================================================
  // PHASE 6 — Gateway Checkout, Signed Webhooks, Manual Verification, Refunds & Receipts
  // ============================================================================

  private resolveGatewayCredentials() {
    const merchantId = (process.env.PAYHERE_MERCHANT_ID || '').trim();
    const merchantSecret = (process.env.PAYHERE_MERCHANT_SECRET || '').trim();
    const modeEnv = (process.env.PAYHERE_MODE || 'sandbox').trim().toLowerCase();

    const isPlaceholder =
      !merchantId ||
      !merchantSecret ||
      merchantId.includes('placeholder') ||
      merchantSecret.includes('placeholder') ||
      merchantId === 'YOUR_MERCHANT_ID' ||
      merchantSecret === 'YOUR_MERCHANT_SECRET';

    if (isPlaceholder) {
      return {
        isLiveConfigured: false,
        isTestMode: true,
        mode: 'TEST_SIMULATION_EXPLICIT' as const,
        merchantId: 'TEST_SIM_MERCHANT',
        merchantSecret: 'TEST_SIMULATION_SECRET_DO_NOT_USE_IN_PROD',
        actionUrl: 'https://sandbox.payhere.lk/pay/checkout',
      };
    }

    const isLive = modeEnv === 'live';
    return {
      isLiveConfigured: true,
      isTestMode: !isLive,
      mode: isLive ? ('LIVE' as const) : ('SANDBOX' as const),
      merchantId,
      merchantSecret,
      actionUrl: isLive
        ? 'https://www.payhere.lk/pay/checkout'
        : 'https://sandbox.payhere.lk/pay/checkout',
    };
  }

  /**
   * Initiates a server-calculated PayHere checkout session for a tuition invoice.
   * - CRITICAL SECURITY: Student can only initiate checkout for their own invoice (`inv.studentId === actor.id`).
   * - Amount is always validated and calculated on the server (`100 <= amountMinor <= balanceMinor`).
   * - Creates a `PENDING` `TuitionPayment` and `TuitionPaymentAllocation`; never marks the invoice paid on checkout creation!
   * - When live/sandbox PayHere credentials are missing, explicitly sets `isTestMode: true` and `mode: 'TEST_SIMULATION_EXPLICIT'` without faking a production payment.
   */
  async createInvoiceCheckout(
    invoiceId: string,
    dto: CreateInvoiceCheckoutDto,
    actor: RequestActor,
  ) {
    const inv = await this.prisma.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        classBatch: {
          select: {
            id: true,
            title: true,
          },
        },
        student: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        allocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!inv) {
      throw new NotFoundException('Tuition invoice not found.');
    }

    if (inv.studentId !== actor.id) {
      throw new ForbiddenException(
        'You can only initiate checkout for your own tuition invoice.',
      );
    }

    const confirmedPaidMinor = inv.allocations.reduce((sum, alloc) => {
      if (isConfirmedPaymentStatus(alloc.payment?.status)) {
        return sum + alloc.amountMinor;
      }
      return sum;
    }, 0);

    const reconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      isVoided: inv.status === TuitionInvoiceStatus.VOIDED,
    });

    if (
      reconciled.status === TuitionInvoiceStatus.VOIDED ||
      reconciled.status === TuitionInvoiceStatus.WAIVED ||
      reconciled.status === TuitionInvoiceStatus.PAID ||
      reconciled.balanceMinor <= 0
    ) {
      throw new BadRequestException(
        `Invoice ${inv.invoiceNumber} has no unpaid balance to checkout (status: ${reconciled.status}).`,
      );
    }

    const requestedMinor =
      dto.amountMinor !== undefined
        ? Math.trunc(dto.amountMinor)
        : reconciled.balanceMinor;

    if (requestedMinor < 100) {
      throw new BadRequestException(
        'Minimum online checkout amount is 1.00 (100 minor units).',
      );
    }
    if (requestedMinor > reconciled.balanceMinor) {
      throw new BadRequestException(
        'Checkout amount cannot exceed the remaining unpaid balance of the invoice.',
      );
    }

    const gw = this.resolveGatewayCredentials();
    const orderId = generateTuitionOrderId(inv.id);
    const amountFormatted = formatPayHereAmount(requestedMinor / 100);
    const hash = payhereCheckoutHash({
      merchantId: gw.merchantId,
      orderId,
      amount: amountFormatted,
      currency: inv.currency,
      merchantSecret: gw.merchantSecret,
    });

    const frontendBase = (
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).replace(/\/$/, '');
    const notifyUrl =
      (process.env.PAYHERE_TUITION_NOTIFY_URL || '').trim() ||
      `${(process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '')}/api/v1/payments/webhooks/payhere`;

    const createdPayment = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.tuitionPayment.create({
        data: {
          classId: inv.classId,
          payerId: inv.studentId,
          channel: TuitionPaymentChannel.ONLINE_GATEWAY,
          gateway: 'PAYHERE',
          providerOrderId: orderId,
          externalReference: orderId,
          currency: inv.currency,
          amountMinor: requestedMinor,
          status: TuitionPaymentStatus.PENDING,
          isTestMode: gw.isTestMode,
          notes: gw.isLiveConfigured
            ? `PayHere ${gw.mode} checkout initiated`
            : 'Explicit test-mode checkout initiated (provider credentials not configured)',
        },
      });

      await tx.tuitionPaymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: inv.id,
          amountMinor: requestedMinor,
        },
      });

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId: inv.id,
          actorId: actor.id,
          action: 'CHECKOUT_INITIATED',
          newValues: {
            paymentId: payment.id,
            providerOrderId: orderId,
            amountMinor: requestedMinor,
            currency: inv.currency,
            mode: gw.mode,
            isTestMode: gw.isTestMode,
          } as Prisma.InputJsonValue,
          reason: `Initiated online checkout (${gw.mode}) for ${inv.currency} ${amountFormatted}`,
        },
      });

      return payment;
    });

    const classTitleObj =
      (inv.classBatch?.title as Record<string, string>) || {};
    const itemTitle = `${classTitleObj.en || 'Tuition'} - ${inv.periodYyyyMm} (${inv.invoiceNumber})`;

    return {
      paymentId: createdPayment.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      providerOrderId: orderId,
      gateway: 'PAYHERE',
      mode: gw.mode,
      isTestMode: gw.isTestMode,
      status: TuitionPaymentStatus.PENDING,
      currency: inv.currency,
      amountMinor: requestedMinor,
      amountFormatted,
      testModeNotice: gw.isLiveConfigured
        ? gw.isTestMode
          ? 'PayHere Sandbox mode is active. Payment remains PENDING until a signed webhook notification is received.'
          : null
        : 'TEST MODE EXPLICIT: Live PayHere credentials are not configured in the environment. This payment is strictly PENDING and will NEVER be marked paid without a signed webhook or authorized manual verification.',
      checkoutPayload: {
        actionUrl: gw.actionUrl,
        fields: {
          merchant_id: gw.merchantId,
          return_url: `${frontendBase}/classes/${inv.classId}?paymentId=${createdPayment.id}&checkout=return`,
          cancel_url: `${frontendBase}/classes/${inv.classId}?paymentId=${createdPayment.id}&checkout=cancel`,
          notify_url: notifyUrl,
          order_id: orderId,
          items: itemTitle.slice(0, 255),
          currency: inv.currency,
          amount: amountFormatted,
          first_name:
            dto.firstName?.trim() ||
            inv.student?.firstName ||
            inv.student?.name ||
            'Student',
          last_name: dto.lastName?.trim() || inv.student?.lastName || '-',
          email: dto.email?.trim() || inv.student?.email || 'student@example.com',
          phone: dto.phone?.trim() || '0770000000',
          address: dto.address?.trim() || 'Sri Lanka',
          city: dto.city?.trim() || 'Colombo',
          country: 'Sri Lanka',
          hash,
        },
      },
    };
  }

  /**
   * Returns current payment status, test-mode flag, invoice balance, and receipt metadata (only if confirmed).
   * - Strictly prevents IDOR: only the student payer or a teacher/admin with read access on the class can inspect the payment.
   * - Polling or client redirect never mutates payment status.
   */
  async getPaymentStatus(paymentId: string, actor: RequestActor) {
    const payment = await this.prisma.tuitionPayment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: {
          include: {
            invoice: true,
          },
        },
        receipt: true,
        manualSubmission: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Tuition payment not found.');
    }

    if (payment.payerId !== actor.id) {
      await this.classesService.requireTeacherReadAccess(
        payment.classId,
        actor,
      );
    }

    const primaryAlloc = payment.allocations[0] || null;
    const invoice = primaryAlloc?.invoice || null;

    return {
      paymentId: payment.id,
      classId: payment.classId,
      payerId: payment.payerId,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      invoiceStatus: invoice?.status ?? null,
      invoiceBalanceMinor: invoice?.balanceMinor ?? null,
      channel: payment.channel,
      gateway: payment.gateway,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      externalReference: payment.externalReference,
      currency: payment.currency,
      amountMinor: payment.amountMinor,
      allocatedMinor: primaryAlloc?.amountMinor ?? 0,
      refundedMinor: payment.refundedMinor,
      status: payment.status,
      isTestMode: payment.isTestMode,
      confirmedAt: payment.confirmedAt
        ? payment.confirmedAt.toISOString()
        : null,
      refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
      refundReason: payment.refundReason,
      manualSubmission: payment.manualSubmission
        ? {
            id: payment.manualSubmission.id,
            status: payment.manualSubmission.status,
            referenceNumber: payment.manualSubmission.referenceNumber,
            reviewReason: payment.manualSubmission.reviewReason,
          }
        : null,
      receipt:
        isConfirmedPaymentStatus(payment.status) && payment.receipt
          ? {
              id: payment.receipt.id,
              receiptNumber: payment.receipt.receiptNumber,
              status: payment.receipt.status,
              paidAmountMinor: payment.receipt.paidAmountMinor,
              balanceAfterMinor: payment.receipt.balanceAfterMinor,
              issuedAt: payment.receipt.issuedAt.toISOString(),
            }
          : null,
    };
  }

  /**
   * Processes server-to-server PayHere webhook notifications (`POST /payments/webhooks/:gateway`).
   * - Validates MD5 signature (`payhereNotifyHash`), merchant ID, currency, and exact integer minor amount.
   * - Enforces idempotency via `TuitionPaymentEvent` unique `(provider, externalEventId)`.
   * - Never downgrades an already `SUCCEEDED` payment when an out-of-order failure (`-1`/`-2`) arrives late.
   * - Handles `status_code = '-3'` (chargeback) by reversing the allocation, restoring invoice balance, and voiding the receipt.
   */
  async handleGatewayWebhook(gateway: string, body: Record<string, string>) {
    if ((gateway || '').trim().toLowerCase() !== 'payhere') {
      throw new BadRequestException(`Unsupported payment gateway: ${gateway}`);
    }

    const merchantId = (body.merchant_id || '').trim();
    const orderId = (body.order_id || '').trim();
    const payhereAmount = (body.payhere_amount || '').trim();
    const payhereCurrency = (body.payhere_currency || '').trim().toUpperCase();
    const statusCode = (body.status_code || '').trim();
    const md5sig = (body.md5sig || '').trim().toUpperCase();
    const providerPaymentId = (body.payment_id || '').trim();

    if (
      !merchantId ||
      !orderId ||
      !payhereAmount ||
      !payhereCurrency ||
      !statusCode ||
      !md5sig
    ) {
      throw new BadRequestException('Incomplete PayHere webhook payload.');
    }

    const payment = await this.prisma.tuitionPayment.findUnique({
      where: { providerOrderId: orderId },
      include: {
        allocations: {
          include: {
            invoice: {
              include: {
                classBatch: {
                  select: {
                    id: true,
                    title: true,
                    primaryTeacher: {
                      select: {
                        id: true,
                        email: true,
                        name: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
                student: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                enrollment: {
                  select: {
                    id: true,
                    studentCode: true,
                  },
                },
                allocations: {
                  include: {
                    payment: true,
                  },
                },
              },
            },
          },
        },
        receipt: true,
      },
    });

    if (!payment) {
      throw new BadRequestException('Unknown tuition payment order_id.');
    }

    const gw = this.resolveGatewayCredentials();
    if (merchantId !== gw.merchantId) {
      throw new BadRequestException('Merchant ID mismatch.');
    }

    const expectedSig = payhereNotifyHash({
      merchantId: gw.merchantId,
      orderId,
      amount: payhereAmount,
      currency: payhereCurrency,
      statusCode,
      merchantSecret: gw.merchantSecret,
    });

    if (expectedSig !== md5sig) {
      throw new BadRequestException('Invalid PayHere webhook signature.');
    }

    if (payhereCurrency !== payment.currency.toUpperCase()) {
      throw new BadRequestException(
        `Webhook currency mismatch: expected ${payment.currency}, received ${payhereCurrency}.`,
      );
    }

    const webhookAmountMinor = Math.round(Number(payhereAmount) * 100);
    if (
      !Number.isFinite(webhookAmountMinor) ||
      webhookAmountMinor !== payment.amountMinor
    ) {
      throw new BadRequestException(
        `Webhook amount mismatch: expected ${payment.amountMinor} minor units, received ${webhookAmountMinor}.`,
      );
    }

    const externalEventId = `${orderId}:${statusCode}:${providerPaymentId || md5sig}`;
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(body || {}))
      .digest('hex');
    const existingEvent = await this.prisma.tuitionPaymentEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: 'PAYHERE',
          externalEventId,
        },
      },
    });

    if (existingEvent) {
      return {
        ok: true,
        duplicate: true,
        paymentId: payment.id,
        status: payment.status,
      };
    }

    const alloc = payment.allocations[0];
    const inv = alloc?.invoice;
    if (!alloc || !inv) {
      throw new BadRequestException(
        'Tuition payment has no linked invoice allocation.',
      );
    }

    const now = new Date();

    // Case 1: Payment succeeded (status_code === '2')
    if (statusCode === '2') {
      if (payment.status === TuitionPaymentStatus.SUCCEEDED) {
        await this.prisma.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'DUPLICATE_NOOP',
            processedAt: now,
          },
        });
        return {
          ok: true,
          duplicate: true,
          paymentId: payment.id,
          status: payment.status,
        };
      }

      if (
        payment.status === TuitionPaymentStatus.REFUNDED ||
        payment.status === TuitionPaymentStatus.PARTIALLY_REFUNDED ||
        payment.status === TuitionPaymentStatus.CHARGEBACK
      ) {
        await this.prisma.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'IGNORED_OUT_OF_ORDER',
            processedAt: now,
          },
        });
        return {
          ok: true,
          ignoredOutOfOrder: true,
          paymentId: payment.id,
          status: payment.status,
        };
      }

      const otherConfirmedMinor = inv.allocations.reduce((sum, a) => {
        if (a.paymentId !== payment.id && isConfirmedPaymentStatus(a.payment?.status)) {
          return sum + a.amountMinor;
        }
        return sum;
      }, 0);

      const nextConfirmedPaidMinor = otherConfirmedMinor + alloc.amountMinor;
      const nextReconciled = reconcileInvoiceFinancials({
        subtotalMinor: inv.subtotalMinor,
        discountMinor: inv.discountMinor,
        surchargeMinor: inv.surchargeMinor,
        confirmedPaidMinor: nextConfirmedPaidMinor,
        dueAt: inv.dueAt,
        graceDays: inv.graceDays,
        now,
      });

      const receiptNumber =
        payment.receipt?.receiptNumber || generateReceiptNumber(payment.id);
      const classTitleObj =
        (inv.classBatch?.title as Record<string, string>) || {};

      await this.prisma.$transaction(async (tx) => {
        await tx.tuitionPayment.update({
          where: { id: payment.id },
          data: {
            status: TuitionPaymentStatus.SUCCEEDED,
            providerPaymentId: providerPaymentId || payment.providerPaymentId,
            externalReference:
              providerPaymentId || payment.externalReference || orderId,
            confirmedAt: now,
          },
        });

        await tx.tuitionInvoice.update({
          where: { id: inv.id },
          data: {
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            status: nextReconciled.status,
            paidAt:
              nextReconciled.status === TuitionInvoiceStatus.PAID
                ? now
                : inv.paidAt,
          },
        });

        if (!payment.receipt) {
          await tx.tuitionReceipt.create({
            data: {
              receiptNumber,
              paymentId: payment.id,
              invoiceId: inv.id,
              classId: inv.classId,
              studentId: inv.studentId,
              currency: inv.currency,
              paidAmountMinor: alloc.amountMinor,
              balanceAfterMinor: nextReconciled.balanceMinor,
              status: 'ISSUED',
              snapshotJson: {
                receiptNumber,
                invoiceNumber: inv.invoiceNumber,
                periodYyyyMm: inv.periodYyyyMm,
                studentName: formatStudentDisplayName(inv.student),
                studentEmail: inv.student?.email || '',
                studentCode: inv.enrollment?.studentCode || '',
                classTitle:
                  classTitleObj.en ||
                  classTitleObj.si ||
                  classTitleObj.ta ||
                  'Class Batch',
                teacherName: formatStudentDisplayName(
                  inv.classBatch?.primaryTeacher,
                ),
                currency: inv.currency,
                channel: TuitionPaymentChannel.ONLINE_GATEWAY,
                externalReference: providerPaymentId || orderId,
                invoiceTotalMinor: nextReconciled.totalMinor,
                paidAmountMinor: alloc.amountMinor,
                balanceAfterMinor: nextReconciled.balanceMinor,
                receiptStatus: 'ISSUED',
                isTestMode: payment.isTestMode,
                issuedAt: now.toISOString(),
              } as Prisma.InputJsonValue,
              issuedAt: now,
            },
          });
        }

        await tx.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'PROCESSED',
            processedAt: now,
          },
        });

        await tx.tuitionBillingAuditEvent.create({
          data: {
            classId: inv.classId,
            invoiceId: inv.id,
            actorId: inv.studentId,
            action: 'WEBHOOK_PAYMENT_CONFIRMED',
            previousValues: {
              paymentStatus: payment.status,
              paidMinor: inv.paidMinor,
              balanceMinor: inv.balanceMinor,
              invoiceStatus: inv.status,
            } as Prisma.InputJsonValue,
            newValues: {
              paymentId: payment.id,
              providerOrderId: orderId,
              providerPaymentId,
              paymentStatus: TuitionPaymentStatus.SUCCEEDED,
              paidMinor: nextReconciled.paidMinor,
              balanceMinor: nextReconciled.balanceMinor,
              invoiceStatus: nextReconciled.status,
              receiptNumber,
            } as Prisma.InputJsonValue,
            reason: `PayHere webhook confirmed payment (${orderId})`,
          },
        });
      });

      return {
        ok: true,
        duplicate: false,
        paymentId: payment.id,
        status: TuitionPaymentStatus.SUCCEEDED,
        invoiceStatus: nextReconciled.status,
        receiptNumber,
      };
    }

    // Case 2: Chargeback (status_code === '-3')
    if (statusCode === '-3') {
      const otherConfirmedMinor = inv.allocations.reduce((sum, a) => {
        if (a.paymentId !== payment.id && isConfirmedPaymentStatus(a.payment?.status)) {
          return sum + a.amountMinor;
        }
        return sum;
      }, 0);

      const nextReconciled = reconcileInvoiceFinancials({
        subtotalMinor: inv.subtotalMinor,
        discountMinor: inv.discountMinor,
        surchargeMinor: inv.surchargeMinor,
        confirmedPaidMinor: otherConfirmedMinor,
        dueAt: inv.dueAt,
        graceDays: inv.graceDays,
        now,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.tuitionPayment.update({
          where: { id: payment.id },
          data: {
            status: TuitionPaymentStatus.CHARGEBACK,
            refundedMinor: payment.amountMinor,
            refundedAt: now,
            refundReason: 'Gateway Chargeback (status_code = -3)',
          },
        });

        await tx.tuitionPaymentAllocation.update({
          where: { id: alloc.id },
          data: { amountMinor: 0 },
        });

        await tx.tuitionInvoice.update({
          where: { id: inv.id },
          data: {
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            status: nextReconciled.status,
            paidAt:
              nextReconciled.status === TuitionInvoiceStatus.PAID
                ? inv.paidAt
                : null,
          },
        });

        if (payment.receipt) {
          await tx.tuitionReceipt.update({
            where: { id: payment.receipt.id },
            data: { status: 'VOIDED_BY_CHARGEBACK' },
          });
        }

        await tx.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'PROCESSED_CHARGEBACK',
            processedAt: now,
          },
        });

        await tx.tuitionBillingAuditEvent.create({
          data: {
            classId: inv.classId,
            invoiceId: inv.id,
            actorId: inv.studentId,
            action: 'WEBHOOK_PAYMENT_CHARGEBACK',
            previousValues: {
              paymentStatus: payment.status,
              paidMinor: inv.paidMinor,
              balanceMinor: inv.balanceMinor,
              invoiceStatus: inv.status,
            } as Prisma.InputJsonValue,
            newValues: {
              paymentId: payment.id,
              paymentStatus: TuitionPaymentStatus.CHARGEBACK,
              paidMinor: nextReconciled.paidMinor,
              balanceMinor: nextReconciled.balanceMinor,
              invoiceStatus: nextReconciled.status,
            } as Prisma.InputJsonValue,
            reason: `PayHere chargeback notification (${orderId})`,
          },
        });
      });

      return {
        ok: true,
        duplicate: false,
        paymentId: payment.id,
        status: TuitionPaymentStatus.CHARGEBACK,
        invoiceStatus: nextReconciled.status,
      };
    }

    // Case 3: Cancelled ('-1') or Failed ('-2')
    if (statusCode === '-1' || statusCode === '-2') {
      if (payment.status !== TuitionPaymentStatus.PENDING) {
        // Out-of-order failure arriving after SUCCEEDED / REFUNDED must NOT downgrade!
        await this.prisma.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'IGNORED_OUT_OF_ORDER',
            processedAt: now,
          },
        });

        return {
          ok: true,
          ignoredOutOfOrder: true,
          paymentId: payment.id,
          status: payment.status,
        };
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.tuitionPayment.update({
          where: { id: payment.id },
          data: {
            status: TuitionPaymentStatus.FAILED,
            providerPaymentId: providerPaymentId || payment.providerPaymentId,
          },
        });

        await tx.tuitionPaymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: 'PAYHERE',
            externalEventId,
            payloadHash,
            rawPayload: body as Prisma.InputJsonValue,
            status: 'PROCESSED_FAILED',
            processedAt: now,
          },
        });
      });

      return {
        ok: true,
        duplicate: false,
        paymentId: payment.id,
        status: TuitionPaymentStatus.FAILED,
      };
    }

    // Case 4: Pending ('0') or other informational status code
    await this.prisma.tuitionPaymentEvent.create({
      data: {
        paymentId: payment.id,
        provider: 'PAYHERE',
        externalEventId,
        payloadHash,
        rawPayload: body as Prisma.InputJsonValue,
        status: 'PROCESSED_PENDING',
        processedAt: now,
      },
    });

    return {
      ok: true,
      duplicate: false,
      paymentId: payment.id,
      status: payment.status,
    };
  }

  /**
   * Submits a manual bank transfer slip or cash payment reference for teacher verification.
   * - CRITICAL SECURITY: Submitting a manual payment creates a `PENDING` payment and `Pending` submission only;
   *   it NEVER reduces `balanceMinor` or marks the invoice `PAID`.
   * - Prevents duplicate `(channel, referenceNumber)` and duplicate `proofChecksumSha256` across submissions.
   */
  async submitManualPayment(
    invoiceId: string,
    dto: CreateManualPaymentSubmissionDto,
    file: Express.Multer.File | undefined,
    actor: RequestActor,
  ) {
    const inv = await this.prisma.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        allocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!inv) {
      throw new NotFoundException('Tuition invoice not found.');
    }

    if (inv.studentId !== actor.id) {
      await this.classesService.requireWriteAccess(inv.classId, actor);
    }

    const confirmedPaidMinor = inv.allocations.reduce((sum, alloc) => {
      if (isConfirmedPaymentStatus(alloc.payment?.status)) {
        return sum + alloc.amountMinor;
      }
      return sum;
    }, 0);

    const reconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      isVoided: inv.status === TuitionInvoiceStatus.VOIDED,
    });

    if (
      reconciled.status === TuitionInvoiceStatus.VOIDED ||
      reconciled.status === TuitionInvoiceStatus.WAIVED ||
      reconciled.status === TuitionInvoiceStatus.PAID ||
      reconciled.balanceMinor <= 0
    ) {
      throw new BadRequestException(
        `Invoice ${inv.invoiceNumber} has no unpaid balance.`,
      );
    }

    const channel = dto.channel ?? TuitionPaymentChannel.BANK_TRANSFER;
    if (
      channel !== TuitionPaymentChannel.BANK_TRANSFER &&
      channel !== TuitionPaymentChannel.CASH
    ) {
      throw new BadRequestException(
        'Manual payment channel must be BANK_TRANSFER or CASH.',
      );
    }

    const amountMinor = Math.trunc(dto.amountMinor);
    if (amountMinor < 100 || amountMinor > reconciled.balanceMinor) {
      throw new BadRequestException(
        'Submitted manual payment amountMinor must be between 100 and the remaining invoice balance.',
      );
    }

    const referenceNumber = dto.referenceNumber.trim();
    const existingRef =
      await this.prisma.tuitionManualPaymentSubmission.findUnique({
        where: {
          channel_referenceNumber: {
            channel,
            referenceNumber,
          },
        },
      });
    if (existingRef) {
      throw new ConflictException(
        `A manual ${channel} submission with reference number "${referenceNumber}" already exists.`,
      );
    }

    let proofStorageKey: string | null = null;
    let proofFileName: string | null = null;
    let proofMimeType: string | null = null;
    let proofChecksumSha256: string | null = null;

    if (file && file.buffer && file.buffer.length > 0) {
      const allowedMimes = new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);
      if (!allowedMimes.has(file.mimetype)) {
        throw new BadRequestException(
          'Invalid proof file type. Only PDF, JPEG, PNG, and WEBP files are accepted.',
        );
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new BadRequestException('Proof file size cannot exceed 10 MB.');
      }

      proofChecksumSha256 = createHash('sha256')
        .update(file.buffer)
        .digest('hex');

      const existingChecksum =
        await this.prisma.tuitionManualPaymentSubmission.findFirst({
          where: {
            proofChecksumSha256,
            status: {
              in: [SlipSubmissionStatus.Pending, SlipSubmissionStatus.Approved],
            },
          },
        });

      if (existingChecksum) {
        throw new ConflictException(
          'This payment proof file has already been submitted for another payment.',
        );
      }

      const dir = path.join(process.cwd(), 'private-storage', 'tuition-slips');
      fs.mkdirSync(dir, { recursive: true });
      const safeExt =
        path.extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '') ||
        '.bin';
      const fileName = `${inv.id}-${Date.now()}-${randomBytes(4).toString('hex')}${safeExt}`;
      fs.writeFileSync(path.join(dir, fileName), file.buffer);

      proofStorageKey = `tuition-slips/${fileName}`;
      proofFileName = file.originalname || fileName;
      proofMimeType = file.mimetype;
    }

    const paidDateObj = new Date(`${dto.paidDate}T00:00:00.000Z`);
    if (Number.isNaN(paidDateObj.getTime())) {
      throw new BadRequestException('Invalid paidDate.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.tuitionPayment.create({
        data: {
          classId: inv.classId,
          payerId: inv.studentId,
          channel,
          externalReference: referenceNumber,
          currency: inv.currency,
          amountMinor,
          status: TuitionPaymentStatus.PENDING,
          notes: dto.note?.trim() || null,
        },
      });

      await tx.tuitionPaymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: inv.id,
          amountMinor,
        },
      });

      const submission = await tx.tuitionManualPaymentSubmission.create({
        data: {
          paymentId: payment.id,
          invoiceId: inv.id,
          classId: inv.classId,
          studentId: inv.studentId,
          channel,
          amountMinor,
          currency: inv.currency,
          referenceNumber,
          paidDate: dto.paidDate,
          note: dto.note?.trim() || null,
          proofStorageKey,
          proofFileName,
          proofMimeType,
          proofChecksumSha256,
          status: SlipSubmissionStatus.Pending,
        },
      });

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId: inv.id,
          actorId: actor.id,
          action: 'MANUAL_PAYMENT_SUBMITTED',
          newValues: {
            submissionId: submission.id,
            paymentId: payment.id,
            channel,
            amountMinor,
            referenceNumber,
            status: SlipSubmissionStatus.Pending,
          } as Prisma.InputJsonValue,
          reason:
            dto.note?.trim() ||
            `Submitted ${channel} reference ${referenceNumber} for teacher verification`,
        },
      });

      return { payment, submission };
    });

    return {
      submissionId: created.submission.id,
      paymentId: created.payment.id,
      invoiceId: inv.id,
      status: created.submission.status,
      paymentStatus: created.payment.status,
      amountMinor,
      referenceNumber,
      invoice: await this.getInvoiceById(inv.id, actor),
    };
  }

  async listManualPaymentSubmissions(
    classId: string,
    query: ListManualSubmissionsQueryDto,
    actor: RequestActor,
  ) {
    await this.classesService.requireTeacherReadAccess(classId, actor);

    const submissions =
      await this.prisma.tuitionManualPaymentSubmission.findMany({
        where: {
          classId,
          ...(query.status ? { status: query.status } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              periodYyyyMm: true,
              totalMinor: true,
              paidMinor: true,
              balanceMinor: true,
              status: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });

    return {
      classId,
      total: submissions.length,
      items: submissions.map((s) => ({
        id: s.id,
        paymentId: s.paymentId,
        invoiceId: s.invoiceId,
        invoiceNumber: s.invoice?.invoiceNumber ?? null,
        periodYyyyMm: s.invoice?.periodYyyyMm ?? null,
        invoiceStatus: s.invoice?.status ?? null,
        invoiceBalanceMinor: s.invoice?.balanceMinor ?? null,
        studentId: s.studentId,
        studentName: formatStudentDisplayName(s.student),
        studentEmail: s.student?.email ?? null,
        channel: s.channel,
        amountMinor: s.amountMinor,
        currency: s.currency,
        referenceNumber: s.referenceNumber,
        paidDate: String(s.paidDate || '').slice(0, 10),
        note: s.note,
        hasProofFile: Boolean(s.proofStorageKey),
        proofOriginalName: s.proofFileName,
        status: s.status,
        reviewReason: s.reviewReason,
        reviewedByName: s.reviewedBy
          ? formatStudentDisplayName(s.reviewedBy)
          : null,
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Teacher/Admin approves a pending manual bank/cash submission.
   * - Enforces `requireWriteAccess(submission.classId, actor)` so Teacher B can NEVER approve Teacher A's class submissions.
   * - Confirms the payment (`SUCCEEDED`), recomputes invoice balance/status, issues an official `TuitionReceipt`, and writes an audit event.
   */
  async approveManualPaymentSubmission(
    submissionId: string,
    dto: ApproveManualPaymentSubmissionDto,
    actor: RequestActor,
  ) {
    const submission =
      await this.prisma.tuitionManualPaymentSubmission.findUnique({
        where: { id: submissionId },
        include: {
          payment: {
            include: {
              receipt: true,
            },
          },
          invoice: {
            include: {
              classBatch: {
                select: {
                  id: true,
                  title: true,
                  primaryTeacher: {
                    select: {
                      id: true,
                      email: true,
                      name: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
              student: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                },
              },
              enrollment: {
                select: {
                  id: true,
                  studentCode: true,
                },
              },
              allocations: {
                include: {
                  payment: true,
                },
              },
            },
          },
        },
      });

    if (!submission) {
      throw new NotFoundException('Manual payment submission not found.');
    }

    await this.classesService.requireWriteAccess(submission.classId, actor);

    if (submission.status !== SlipSubmissionStatus.Pending) {
      throw new BadRequestException(
        `Manual submission has already been reviewed (status: ${submission.status}).`,
      );
    }

    const paymentId = submission.paymentId;
    if (!paymentId) {
      throw new BadRequestException(
        'Manual submission is missing a linked payment record.',
      );
    }

    const inv = submission.invoice;
    const confirmedPaidMinor = inv.allocations.reduce((sum, alloc) => {
      if (
        alloc.paymentId !== paymentId &&
        isConfirmedPaymentStatus(alloc.payment?.status)
      ) {
        return sum + alloc.amountMinor;
      }
      return sum;
    }, 0);

    const currentReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      isVoided: inv.status === TuitionInvoiceStatus.VOIDED,
    });

    if (submission.amountMinor > currentReconciled.balanceMinor) {
      throw new BadRequestException(
        'Submission amount exceeds the remaining unpaid balance of the invoice.',
      );
    }

    const now = new Date();
    const nextConfirmedPaidMinor = confirmedPaidMinor + submission.amountMinor;
    const nextReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor: nextConfirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      now,
    });

    const receiptNumber = generateReceiptNumber(paymentId);
    const classTitleObj =
      (inv.classBatch?.title as Record<string, string>) || {};

    await this.prisma.$transaction(async (tx) => {
      await tx.tuitionManualPaymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: SlipSubmissionStatus.Approved,
          reviewedById: actor.id,
          reviewedAt: now,
          reviewReason: dto.note?.trim() || 'Verified by teacher',
        },
      });

      await tx.tuitionPayment.update({
        where: { id: paymentId },
        data: {
          status: TuitionPaymentStatus.SUCCEEDED,
          verifiedById: actor.id,
          confirmedAt: now,
        },
      });

      await tx.tuitionInvoice.update({
        where: { id: inv.id },
        data: {
          paidMinor: nextReconciled.paidMinor,
          balanceMinor: nextReconciled.balanceMinor,
          status: nextReconciled.status,
          paidAt:
            nextReconciled.status === TuitionInvoiceStatus.PAID
              ? now
              : inv.paidAt,
        },
      });

      await tx.tuitionReceipt.create({
        data: {
          receiptNumber,
          paymentId,
          invoiceId: inv.id,
          classId: inv.classId,
          studentId: inv.studentId,
          currency: inv.currency,
          paidAmountMinor: submission.amountMinor,
          balanceAfterMinor: nextReconciled.balanceMinor,
          status: 'ISSUED',
          snapshotJson: {
            receiptNumber,
            invoiceNumber: inv.invoiceNumber,
            periodYyyyMm: inv.periodYyyyMm,
            studentName: formatStudentDisplayName(inv.student),
            studentEmail: inv.student?.email || '',
            studentCode: inv.enrollment?.studentCode || '',
            classTitle:
              classTitleObj.en ||
              classTitleObj.si ||
              classTitleObj.ta ||
              'Class Batch',
            teacherName: formatStudentDisplayName(
              inv.classBatch?.primaryTeacher,
            ),
            currency: inv.currency,
            channel: submission.channel,
            externalReference: submission.referenceNumber,
            invoiceTotalMinor: nextReconciled.totalMinor,
            paidAmountMinor: submission.amountMinor,
            balanceAfterMinor: nextReconciled.balanceMinor,
            receiptStatus: 'ISSUED',
            isTestMode: false,
            issuedAt: now.toISOString(),
          } as Prisma.InputJsonValue,
          issuedAt: now,
        },
      });

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId: inv.id,
          actorId: actor.id,
          action: 'MANUAL_PAYMENT_APPROVED',
          previousValues: {
            submissionStatus: submission.status,
            paidMinor: inv.paidMinor,
            balanceMinor: inv.balanceMinor,
            invoiceStatus: inv.status,
          } as Prisma.InputJsonValue,
          newValues: {
            submissionId: submission.id,
            paymentId,
            submissionStatus: SlipSubmissionStatus.Approved,
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            invoiceStatus: nextReconciled.status,
            receiptNumber,
          } as Prisma.InputJsonValue,
          reason:
            dto.note?.trim() ||
            `Approved manual ${submission.channel} reference ${submission.referenceNumber}`,
        },
      });
    });

    return {
      submissionId: submission.id,
      paymentId,
      status: SlipSubmissionStatus.Approved,
      paymentStatus: TuitionPaymentStatus.SUCCEEDED,
      receiptNumber,
      invoice: await this.getInvoiceById(inv.id, actor),
    };
  }

  /**
   * Teacher/Admin rejects a pending manual bank/cash submission with mandatory reason.
   * - Marks the submission `Rejected` and the payment `FAILED`.
   * - Invoice balance remains untouched.
   */
  async rejectManualPaymentSubmission(
    submissionId: string,
    dto: RejectManualPaymentSubmissionDto,
    actor: RequestActor,
  ) {
    const submission =
      await this.prisma.tuitionManualPaymentSubmission.findUnique({
        where: { id: submissionId },
      });

    if (!submission) {
      throw new NotFoundException('Manual payment submission not found.');
    }

    await this.classesService.requireWriteAccess(submission.classId, actor);

    if (submission.status !== SlipSubmissionStatus.Pending) {
      throw new BadRequestException(
        `Manual submission has already been reviewed (status: ${submission.status}).`,
      );
    }

    const now = new Date();
    const reason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.tuitionManualPaymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: SlipSubmissionStatus.Rejected,
          reviewedById: actor.id,
          reviewedAt: now,
          reviewReason: reason,
        },
      });

      if (submission.paymentId) {
        await tx.tuitionPayment.update({
          where: { id: submission.paymentId },
          data: {
            status: TuitionPaymentStatus.FAILED,
          },
        });
      }

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: submission.classId,
          invoiceId: submission.invoiceId,
          actorId: actor.id,
          action: 'MANUAL_PAYMENT_REJECTED',
          previousValues: {
            submissionStatus: submission.status,
          } as Prisma.InputJsonValue,
          newValues: {
            submissionId: submission.id,
            paymentId: submission.paymentId,
            submissionStatus: SlipSubmissionStatus.Rejected,
            paymentStatus: TuitionPaymentStatus.FAILED,
          } as Prisma.InputJsonValue,
          reason,
        },
      });
    });

    return {
      submissionId: submission.id,
      paymentId: submission.paymentId,
      status: SlipSubmissionStatus.Rejected,
      paymentStatus: TuitionPaymentStatus.FAILED,
      reviewReason: reason,
      invoice: await this.getInvoiceById(submission.invoiceId, actor),
    };
  }

  /**
   * Refunds (partially or in full) or records a chargeback against a confirmed `TuitionPayment`.
   * - Reduces the active `TuitionPaymentAllocation.amountMinor` and recomputes the invoice `paidMinor`, `balanceMinor`, and `status`.
   * - Voids the official receipt when fully refunded or charged back.
   */
  async refundTuitionPayment(
    paymentId: string,
    dto: RefundTuitionPaymentDto,
    actor: RequestActor,
  ) {
    const payment = await this.prisma.tuitionPayment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: {
          include: {
            invoice: {
              include: {
                allocations: {
                  include: {
                    payment: true,
                  },
                },
              },
            },
          },
        },
        receipt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Tuition payment not found.');
    }

    await this.classesService.requireWriteAccess(payment.classId, actor);

    if (!isConfirmedPaymentStatus(payment.status)) {
      throw new BadRequestException(
        `Only confirmed (SUCCEEDED or PARTIALLY_REFUNDED) payments can be refunded (current status: ${payment.status}).`,
      );
    }

    const alloc = payment.allocations[0];
    const inv = alloc?.invoice;
    if (!alloc || !inv) {
      throw new BadRequestException(
        'Tuition payment has no linked invoice allocation.',
      );
    }

    const maxRefundableMinor = payment.amountMinor - payment.refundedMinor;
    const refundMinor =
      dto.amountMinor !== undefined
        ? Math.trunc(dto.amountMinor)
        : maxRefundableMinor;

    if (refundMinor <= 0 || refundMinor > maxRefundableMinor) {
      throw new BadRequestException(
        `Refund amountMinor must be between 1 and ${maxRefundableMinor}.`,
      );
    }

    const nextRefundedMinor = payment.refundedMinor + refundMinor;
    const nextAllocMinor = Math.max(0, payment.amountMinor - nextRefundedMinor);
    const nextPaymentStatus = dto.isChargeback
      ? TuitionPaymentStatus.CHARGEBACK
      : nextRefundedMinor >= payment.amountMinor
        ? TuitionPaymentStatus.REFUNDED
        : TuitionPaymentStatus.PARTIALLY_REFUNDED;

    const otherConfirmedMinor = inv.allocations.reduce((sum, a) => {
      if (a.paymentId !== payment.id && isConfirmedPaymentStatus(a.payment?.status)) {
        return sum + a.amountMinor;
      }
      return sum;
    }, 0);

    const nextConfirmedPaidMinor =
      nextPaymentStatus === TuitionPaymentStatus.PARTIALLY_REFUNDED
        ? otherConfirmedMinor + nextAllocMinor
        : otherConfirmedMinor;

    const now = new Date();
    const nextReconciled = reconcileInvoiceFinancials({
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      surchargeMinor: inv.surchargeMinor,
      confirmedPaidMinor: nextConfirmedPaidMinor,
      dueAt: inv.dueAt,
      graceDays: inv.graceDays,
      now,
    });

    const reason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.tuitionPayment.update({
        where: { id: payment.id },
        data: {
          status: nextPaymentStatus,
          refundedMinor: nextRefundedMinor,
          refundedAt: now,
          refundReason: reason,
        },
      });

      await tx.tuitionPaymentAllocation.update({
        where: { id: alloc.id },
        data: {
          amountMinor:
            nextPaymentStatus === TuitionPaymentStatus.PARTIALLY_REFUNDED
              ? nextAllocMinor
              : 0,
        },
      });

      await tx.tuitionInvoice.update({
        where: { id: inv.id },
        data: {
          paidMinor: nextReconciled.paidMinor,
          balanceMinor: nextReconciled.balanceMinor,
          status: nextReconciled.status,
          paidAt:
            nextReconciled.status === TuitionInvoiceStatus.PAID
              ? inv.paidAt
              : null,
        },
      });

      if (payment.receipt) {
        await tx.tuitionReceipt.update({
          where: { id: payment.receipt.id },
          data: {
            status:
              nextPaymentStatus === TuitionPaymentStatus.CHARGEBACK
                ? 'VOIDED_BY_CHARGEBACK'
                : nextPaymentStatus === TuitionPaymentStatus.REFUNDED
                  ? 'VOIDED_BY_REFUND'
                  : 'PARTIALLY_REFUNDED',
            paidAmountMinor:
              nextPaymentStatus === TuitionPaymentStatus.PARTIALLY_REFUNDED
                ? nextAllocMinor
                : 0,
            balanceAfterMinor: nextReconciled.balanceMinor,
          },
        });
      }

      await tx.tuitionBillingAuditEvent.create({
        data: {
          classId: inv.classId,
          invoiceId: inv.id,
          actorId: actor.id,
          action: dto.isChargeback ? 'PAYMENT_CHARGEBACK' : 'PAYMENT_REFUNDED',
          previousValues: {
            paymentStatus: payment.status,
            refundedMinor: payment.refundedMinor,
            paidMinor: inv.paidMinor,
            balanceMinor: inv.balanceMinor,
            invoiceStatus: inv.status,
          } as Prisma.InputJsonValue,
          newValues: {
            paymentId: payment.id,
            refundMinor,
            refundedMinor: nextRefundedMinor,
            paymentStatus: nextPaymentStatus,
            paidMinor: nextReconciled.paidMinor,
            balanceMinor: nextReconciled.balanceMinor,
            invoiceStatus: nextReconciled.status,
          } as Prisma.InputJsonValue,
          reason,
        },
      });
    });

    return {
      paymentId: payment.id,
      status: nextPaymentStatus,
      refundedMinor: nextRefundedMinor,
      invoice: await this.getInvoiceById(inv.id, actor),
    };
  }

  /**
   * Returns an official printable receipt for a confirmed tuition payment.
   * - Strictly forbids receipt generation or download for `PENDING` or `FAILED` payments.
   * - Enforces ownership (`payment.payerId === actor.id` or teacher read access on `payment.classId`).
   */
  async getPaymentReceipt(paymentId: string, actor: RequestActor) {
    const payment = await this.prisma.tuitionPayment.findUnique({
      where: { id: paymentId },
      include: {
        receipt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Tuition payment not found.');
    }

    if (payment.payerId !== actor.id) {
      await this.classesService.requireTeacherReadAccess(
        payment.classId,
        actor,
      );
    }

    if (
      payment.status === TuitionPaymentStatus.PENDING ||
      payment.status === TuitionPaymentStatus.FAILED
    ) {
      throw new BadRequestException(
        `No official receipt is available for an unconfirmed (${payment.status}) payment.`,
      );
    }

    if (!payment.receipt) {
      throw new NotFoundException(
        'Receipt record not found for this tuition payment.',
      );
    }

    const snapshot =
      (payment.receipt.snapshotJson as Record<string, any>) || {};
    const mergedSnapshot = {
      ...snapshot,
      receiptNumber: payment.receipt.receiptNumber,
      receiptStatus: payment.receipt.status,
      paidAmountMinor: payment.receipt.paidAmountMinor,
      balanceAfterMinor: payment.receipt.balanceAfterMinor,
      isTestMode: payment.isTestMode,
      issuedAt: payment.receipt.issuedAt.toISOString(),
    };

    return {
      id: payment.receipt.id,
      receiptNumber: payment.receipt.receiptNumber,
      paymentId: payment.id,
      invoiceId: payment.receipt.invoiceId,
      classId: payment.receipt.classId,
      studentId: payment.receipt.studentId,
      currency: payment.receipt.currency,
      paidAmountMinor: payment.receipt.paidAmountMinor,
      balanceAfterMinor: payment.receipt.balanceAfterMinor,
      status: payment.receipt.status,
      isTestMode: payment.isTestMode,
      issuedAt: payment.receipt.issuedAt.toISOString(),
      snapshot: mergedSnapshot,
      printableHtml: renderTuitionReceiptHtml(mergedSnapshot),
    };
  }

  async getClassPaymentSummary(
    classId: string,
    period: string | undefined,
    actor: RequestActor,
  ) {
    const ledger = await this.listClassInvoices(classId, { period }, actor);
    const pendingManualCount =
      await this.prisma.tuitionManualPaymentSubmission.count({
        where: {
          classId,
          status: SlipSubmissionStatus.Pending,
        },
      });

    const payments = await this.prisma.tuitionPayment.findMany({
      where: {
        classId,
      },
      include: {
        receipt: true,
      },
    });

    let onlineConfirmedMinor = 0;
    let manualConfirmedMinor = 0;
    let refundedTotalMinor = 0;
    let issuedReceiptsCount = 0;

    for (const p of payments) {
      refundedTotalMinor += p.refundedMinor || 0;
      if (isConfirmedPaymentStatus(p.status)) {
        const net = Math.max(0, p.amountMinor - (p.refundedMinor || 0));
        if (p.channel === TuitionPaymentChannel.ONLINE_GATEWAY) {
          onlineConfirmedMinor += net;
        } else {
          manualConfirmedMinor += net;
        }
      }
      if (p.receipt && p.receipt.status === 'ISSUED') {
        issuedReceiptsCount += 1;
      }
    }

    return {
      classId,
      period: period || null,
      currency: ledger.currency,
      invoiceSummary: ledger.summary,
      paymentSummary: {
        onlineConfirmedMinor,
        manualConfirmedMinor,
        refundedTotalMinor,
        pendingManualVerificationsCount: pendingManualCount,
        issuedReceiptsCount,
      },
    };
  }
}

