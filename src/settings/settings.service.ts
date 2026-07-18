import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateNotificationSettingsDto,
  UpdateSmsSettingsDto,
  UpdateSmtpSettingsDto,
} from './dto/notification-settings.dto';
import { NotificationConfigService } from './notification-config.service';
import { UpdateBillingSettingsDto } from './dto/billing-settings.dto';
import { UpdateAiSettingsDto } from './dto/ai-settings.dto';
import { UpdateSeoSettingsDto } from './dto/seo-settings.dto';
import {
  DEFAULT_SMTP_CONFIG,
  mergeBilling,
  SmsConfig,
  SmtpConfig,
} from './notification-config.types';
import { mergeSeo } from './seo-config.types';

const SETTINGS_ID = 'default';

export interface AiChatConfig {
  enabled: boolean;
  provider: 'gemini';
  model: string;
  apiKey: string;
  fallbacks: string;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationConfig: NotificationConfigService,
    private readonly config: ConfigService,
  ) {}

  async getBillingSettings() {
    const row = await this.ensureRow();
    const billing = mergeBilling(row.billing);
    return {
      monthlyStudentFeeLkr: billing.monthlyStudentFeeLkr,
      paymentMode: billing.paymentMode,
      updatedAt: row.updatedAt,
    };
  }

  async updateBillingSettings(dto: UpdateBillingSettingsDto, updatedBy?: string) {
    await this.ensureRow();
    const billing = mergeBilling({
      monthlyStudentFeeLkr: dto.monthlyStudentFeeLkr,
      paymentMode: dto.paymentMode,
    });
    await this.prisma.systemSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        billing: billing as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
      },
    });
    return this.getBillingSettings();
  }

  async getNotificationSettings() {
    const row = await this.ensureRow();
    const smtp = this.notificationConfig.mergeSmtp(row.smtp);
    const sms = this.notificationConfig.mergeSms(row.sms);

    return {
      smtp: {
        host: smtp.host,
        port: smtp.port,
        encryption: smtp.encryption,
        user: smtp.user,
        from: smtp.from,
        hasPassword: Boolean(smtp.pass),
      },
      sms: {
        provider: sms.provider,
        hutchApiUrl: sms.hutchApiUrl,
        hutchUsername: sms.hutchUsername,
        hasHutchApiKey: Boolean(sms.hutchApiKey),
        notifyUserId: sms.notifyUserId,
        hasNotifyApiKey: Boolean(sms.notifyApiKey),
        notifySenderId: sms.notifySenderId,
        notifyApiUrl: sms.notifyApiUrl,
      },
      updatedAt: row.updatedAt,
    };
  }

  /** Resolved AI config for runtime use (includes secret key). */
  async getAiChatConfig(): Promise<AiChatConfig> {
    const row = await this.ensureRow();
    return this.mergeAi(row.ai);
  }

  async getAiSettings() {
    const cfg = await this.getAiChatConfig();
    return {
      enabled: cfg.enabled,
      provider: cfg.provider,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      hasApiKey: Boolean(cfg.apiKey),
      /** Hint only — Flash Live is voice; text chat uses Flash (non-Live). */
      note:
        'Kadaima Expert + WhatsApp use Gemini text models (generateContent). ' +
        'Gemini 3 Flash Live is a separate voice Live API and is not used for this chatbot.',
      recommendedModel: 'gemini-3-flash-preview',
    };
  }

  async updateAiSettings(dto: UpdateAiSettingsDto, updatedBy?: string) {
    const current = await this.getAiChatConfig();
    const next: AiChatConfig = {
      enabled: dto.enabled ?? current.enabled,
      provider: dto.provider ?? current.provider,
      model: (dto.model ?? current.model).trim() || 'gemini-3-flash-preview',
      apiKey:
        dto.apiKey !== undefined && dto.apiKey.trim().length > 0
          ? dto.apiKey.trim()
          : current.apiKey,
      fallbacks:
        dto.fallbacks !== undefined
          ? dto.fallbacks.trim()
          : current.fallbacks,
    };

    await this.prisma.systemSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        ai: next as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
      },
    });

    return this.getAiSettings();
  }

  private mergeAi(raw: unknown): AiChatConfig {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<AiChatConfig>;
    const envKey = this.config.get<string>('AI_API_KEY') || process.env.AI_API_KEY || '';
    const envModel =
      this.config.get<string>('AI_MODEL') ||
      process.env.AI_MODEL ||
      'gemini-3-flash-preview';
    const envFallbacks =
      this.config.get<string>('AI_MODEL_FALLBACKS') ||
      process.env.AI_MODEL_FALLBACKS ||
      'gemini-2.0-flash,gemini-2.0-flash-lite,gemini-2.5-flash';

    return {
      enabled: obj.enabled !== false,
      provider: 'gemini',
      model: (obj.model || envModel).trim() || 'gemini-3-flash-preview',
      apiKey: (obj.apiKey || envKey).trim(),
      fallbacks: (obj.fallbacks || envFallbacks).trim(),
    };
  }

  async getSeoSettings() {
    const row = await this.ensureRow();
    const seo = mergeSeo(row.seo);
    return {
      ...seo,
      updatedAt: row.updatedAt,
    };
  }

  /** Public, non-secret SEO fields for the website (meta + Analytics ID). */
  async getPublicSeoSettings() {
    const seo = await this.getSeoSettings();
    return {
      siteName: seo.siteName,
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      googleAnalyticsId: seo.googleAnalyticsId || null,
      ogImageUrl: seo.ogImageUrl || null,
      keywords: seo.keywords || null,
    };
  }

  async updateSeoSettings(dto: UpdateSeoSettingsDto, updatedBy?: string) {
    const current = mergeSeo((await this.ensureRow()).seo);
    const next = mergeSeo({
      siteName: dto.siteName !== undefined ? dto.siteName : current.siteName,
      metaTitle: dto.metaTitle !== undefined ? dto.metaTitle : current.metaTitle,
      metaDescription:
        dto.metaDescription !== undefined ? dto.metaDescription : current.metaDescription,
      googleAnalyticsId:
        dto.googleAnalyticsId !== undefined
          ? dto.googleAnalyticsId
          : current.googleAnalyticsId,
      ogImageUrl: dto.ogImageUrl !== undefined ? dto.ogImageUrl : current.ogImageUrl,
      keywords: dto.keywords !== undefined ? dto.keywords : current.keywords,
    });

    await this.prisma.systemSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        seo: next as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
      },
    });

    return this.getSeoSettings();
  }

  async updateNotificationSettings(
    dto: UpdateNotificationSettingsDto,
    updatedBy?: string,
  ) {
    const row = await this.ensureRow();
    const currentSmtp = this.notificationConfig.mergeSmtp(row.smtp);
    const currentSms = this.notificationConfig.mergeSms(row.sms);

    const nextSmtp = dto.smtp
      ? this.applySmtpUpdate(currentSmtp, dto.smtp)
      : currentSmtp;
    const nextSms = dto.sms
      ? this.applySmsUpdate(currentSms, dto.sms)
      : currentSms;

    await this.prisma.systemSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        smtp: nextSmtp as unknown as Prisma.InputJsonValue,
        sms: nextSms as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
      },
    });

    return this.getNotificationSettings();
  }

  private async ensureRow() {
    const existing = await this.prisma.systemSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;

    return this.prisma.systemSetting.create({
      data: {
        id: SETTINGS_ID,
        smtp: this.notificationConfig.mergeSmtp(null) as unknown as Prisma.InputJsonValue,
        sms: this.notificationConfig.mergeSms(null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private applySmtpUpdate(current: SmtpConfig, dto: UpdateSmtpSettingsDto): SmtpConfig {
    return {
      host: dto.host.trim() || DEFAULT_SMTP_CONFIG.host,
      port: dto.port,
      encryption: dto.encryption,
      user: dto.user?.trim() ?? current.user,
      pass: dto.pass && dto.pass.length > 0 ? dto.pass : current.pass,
      from: dto.from?.trim() ?? current.from,
    };
  }

  private applySmsUpdate(current: SmsConfig, dto: UpdateSmsSettingsDto): SmsConfig {
    return {
      provider: dto.provider,
      hutchApiUrl: dto.hutchApiUrl?.trim() || current.hutchApiUrl,
      hutchUsername: dto.hutchUsername?.trim() ?? current.hutchUsername,
      hutchApiKey:
        dto.hutchApiKey && dto.hutchApiKey.length > 0
          ? dto.hutchApiKey
          : current.hutchApiKey,
      notifyUserId: dto.notifyUserId?.trim() ?? current.notifyUserId,
      notifyApiKey:
        dto.notifyApiKey && dto.notifyApiKey.length > 0
          ? dto.notifyApiKey
          : current.notifyApiKey,
      notifySenderId: dto.notifySenderId?.trim() || current.notifySenderId,
      notifyApiUrl: dto.notifyApiUrl?.trim() || current.notifyApiUrl,
    };
  }
}
