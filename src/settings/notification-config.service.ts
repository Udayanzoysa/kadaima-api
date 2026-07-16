import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_SMS_CONFIG,
  DEFAULT_SMTP_CONFIG,
  SmsConfig,
  SmtpConfig,
} from './notification-config.types';

const SETTINGS_ID = 'default';

@Injectable()
export class NotificationConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getRuntimeSmtp(): Promise<SmtpConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    return this.mergeSmtp(row?.smtp);
  }

  async getRuntimeSms(): Promise<SmsConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    return this.mergeSms(row?.sms);
  }

  mergeSmtp(raw: unknown): SmtpConfig {
    const fromDb = (raw && typeof raw === 'object' ? raw : {}) as Partial<SmtpConfig>;
    const env = this.envSmtpFallback();
    return {
      host: fromDb.host || env.host || DEFAULT_SMTP_CONFIG.host,
      port: Number(fromDb.port || env.port || DEFAULT_SMTP_CONFIG.port),
      encryption:
        (fromDb.encryption as SmtpConfig['encryption']) ||
        env.encryption ||
        DEFAULT_SMTP_CONFIG.encryption,
      user: fromDb.user ?? env.user ?? '',
      pass: fromDb.pass ?? env.pass ?? '',
      from: fromDb.from ?? env.from ?? '',
    };
  }

  mergeSms(raw: unknown): SmsConfig {
    const fromDb = (raw && typeof raw === 'object' ? raw : {}) as Partial<SmsConfig>;
    const env = this.envSmsFallback();
    return {
      provider:
        (fromDb.provider as SmsConfig['provider']) ||
        env.provider ||
        DEFAULT_SMS_CONFIG.provider,
      hutchApiUrl: fromDb.hutchApiUrl || env.hutchApiUrl || DEFAULT_SMS_CONFIG.hutchApiUrl,
      hutchUsername: fromDb.hutchUsername ?? env.hutchUsername ?? '',
      hutchApiKey: fromDb.hutchApiKey ?? env.hutchApiKey ?? '',
      notifyUserId: fromDb.notifyUserId ?? env.notifyUserId ?? '',
      notifyApiKey: fromDb.notifyApiKey ?? env.notifyApiKey ?? '',
      notifySenderId:
        fromDb.notifySenderId || env.notifySenderId || DEFAULT_SMS_CONFIG.notifySenderId,
      notifyApiUrl: fromDb.notifyApiUrl || env.notifyApiUrl || DEFAULT_SMS_CONFIG.notifyApiUrl,
    };
  }

  private envSmtpFallback(): SmtpConfig {
    const secure = this.config.get<boolean>('SMTP_SECURE');
    const port = this.config.get<number>('SMTP_PORT') ?? DEFAULT_SMTP_CONFIG.port;
    let encryption: SmtpConfig['encryption'] = DEFAULT_SMTP_CONFIG.encryption;
    if (secure === true || port === 465) encryption = 'SSL';
    else if (secure === false && port === 587) encryption = 'STARTTLS';

    return {
      host: this.config.get<string>('SMTP_HOST') || DEFAULT_SMTP_CONFIG.host,
      port,
      encryption,
      user: this.config.get<string>('SMTP_USER') || '',
      pass: this.config.get<string>('SMTP_PASS') || '',
      from: this.config.get<string>('SMTP_FROM') || '',
    };
  }

  private envSmsFallback(): SmsConfig {
    return {
      provider:
        (this.config.get<string>('SMS_GATEWAY_PROVIDER') as SmsConfig['provider']) ||
        DEFAULT_SMS_CONFIG.provider,
      hutchApiUrl:
        this.config.get<string>('HUTCH_API_URL') || DEFAULT_SMS_CONFIG.hutchApiUrl,
      hutchUsername: this.config.get<string>('HUTCH_USERNAME') || '',
      hutchApiKey: this.config.get<string>('HUTCH_API_KEY') || '',
      notifyUserId: this.config.get<string>('NOTIFY_USER_ID') || '',
      notifyApiKey: this.config.get<string>('NOTIFY_API_KEY') || '',
      notifySenderId:
        this.config.get<string>('NOTIFY_SENDER_ID') || DEFAULT_SMS_CONFIG.notifySenderId,
      notifyApiUrl:
        this.config.get<string>('NOTIFY_API_URL') || DEFAULT_SMS_CONFIG.notifyApiUrl,
    };
  }
}
