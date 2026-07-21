export type SmtpEncryption = 'SSL' | 'STARTTLS' | 'NONE';
export type SmsProvider = 'HUTCH' | 'NOTIFY_LK';

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  user: string;
  pass: string;
  from: string;
}

export interface SmsConfig {
  provider: SmsProvider;
  hutchApiUrl: string;
  hutchUsername: string;
  hutchApiKey: string;
  notifyUserId: string;
  notifyApiKey: string;
  notifySenderId: string;
  notifyApiUrl: string;
}

export const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: 'mail.privateemail.com',
  port: 465,
  encryption: 'SSL',
  user: '',
  pass: '',
  from: '',
};

export const DEFAULT_SMS_CONFIG: SmsConfig = {
  provider: 'HUTCH',
  hutchApiUrl: 'https://api.hutch.lk/v1/send',
  hutchUsername: '',
  hutchApiKey: '',
  notifyUserId: '',
  notifyApiKey: '',
  notifySenderId: 'NotifyDEMO',
  notifyApiUrl: 'https://app.notify.lk/api/v1/send',
};

export function smtpSecureFlag(encryption: SmtpEncryption, port: number): boolean {
  if (encryption === 'SSL') return true;
  if (encryption === 'STARTTLS' || encryption === 'NONE') return false;
  // Fallback: conventional port mapping
  return port === 465;
}

/**
 * Platform payment mode for locked quizzes:
 * - MIXED: monthly sub unlocks locked quizzes with no price; priced quizzes need a separate pay
 * - MONTHLY_ONLY: monthly sub unlocks every locked quiz (quiz prices ignored for access)
 * - QUIZ_ONLY: each locked quiz is paid individually (no monthly subscription)
 */
export type PaymentMode = 'MIXED' | 'MONTHLY_ONLY' | 'QUIZ_ONLY';

export interface BillingConfig {
  monthlyStudentFeeLkr: number;
  paymentMode: PaymentMode;
  /** Platform cut of subscription revenue (default 40). */
  platformPct: number;
  /** Teacher pool share of subscription revenue (default 60). */
  teacherPoolPct: number;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  monthlyStudentFeeLkr: 500,
  paymentMode: 'MIXED',
  platformPct: 40,
  teacherPoolPct: 60,
};

const PAYMENT_MODES: PaymentMode[] = ['MIXED', 'MONTHLY_ONLY', 'QUIZ_ONLY'];

function clampPct(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

export function mergeBilling(raw: unknown): BillingConfig {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fee = Number(obj.monthlyStudentFeeLkr);
  const modeRaw = String(obj.paymentMode ?? '').toUpperCase();
  const paymentMode = PAYMENT_MODES.includes(modeRaw as PaymentMode)
    ? (modeRaw as PaymentMode)
    : DEFAULT_BILLING_CONFIG.paymentMode;

  let platformPct = clampPct(
    obj.platformPct,
    DEFAULT_BILLING_CONFIG.platformPct,
  );
  let teacherPoolPct = clampPct(
    obj.teacherPoolPct,
    DEFAULT_BILLING_CONFIG.teacherPoolPct,
  );

  // Prefer platformPct when both are set inconsistently; keep sum at 100.
  if (
    obj.platformPct != null &&
    obj.teacherPoolPct != null &&
    Math.abs(platformPct + teacherPoolPct - 100) > 0.001
  ) {
    teacherPoolPct = Math.round((100 - platformPct) * 100) / 100;
  } else if (obj.platformPct != null && obj.teacherPoolPct == null) {
    teacherPoolPct = Math.round((100 - platformPct) * 100) / 100;
  } else if (obj.teacherPoolPct != null && obj.platformPct == null) {
    platformPct = Math.round((100 - teacherPoolPct) * 100) / 100;
  }

  return {
    monthlyStudentFeeLkr:
      Number.isFinite(fee) && fee >= 0
        ? fee
        : DEFAULT_BILLING_CONFIG.monthlyStudentFeeLkr,
    paymentMode,
    platformPct,
    teacherPoolPct,
  };
}

/** Locked quiz with a positive price is a "special" pay-per-quiz item. */
export function isSpecialPricedQuiz(priceLkr: number | string | null | undefined) {
  if (priceLkr == null) return false;
  const n = Number(priceLkr);
  return Number.isFinite(n) && n > 0;
}
