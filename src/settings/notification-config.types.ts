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
