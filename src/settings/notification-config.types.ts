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
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  monthlyStudentFeeLkr: 500,
  paymentMode: 'MIXED',
};

const PAYMENT_MODES: PaymentMode[] = ['MIXED', 'MONTHLY_ONLY', 'QUIZ_ONLY'];

export function mergeBilling(raw: unknown): BillingConfig {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fee = Number(obj.monthlyStudentFeeLkr);
  const modeRaw = String(obj.paymentMode ?? '').toUpperCase();
  const paymentMode = PAYMENT_MODES.includes(modeRaw as PaymentMode)
    ? (modeRaw as PaymentMode)
    : DEFAULT_BILLING_CONFIG.paymentMode;
  return {
    monthlyStudentFeeLkr:
      Number.isFinite(fee) && fee >= 0
        ? fee
        : DEFAULT_BILLING_CONFIG.monthlyStudentFeeLkr,
    paymentMode,
  };
}

/** Locked quiz with a positive price is a "special" pay-per-quiz item. */
export function isSpecialPricedQuiz(priceLkr: number | string | null | undefined) {
  if (priceLkr == null) return false;
  const n = Number(priceLkr);
  return Number.isFinite(n) && n > 0;
}
