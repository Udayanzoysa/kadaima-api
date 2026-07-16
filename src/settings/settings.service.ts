import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateNotificationSettingsDto,
  UpdateSmsSettingsDto,
  UpdateSmtpSettingsDto,
} from './dto/notification-settings.dto';
import { NotificationConfigService } from './notification-config.service';
import {
  DEFAULT_SMTP_CONFIG,
  SmsConfig,
  SmtpConfig,
} from './notification-config.types';

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationConfig: NotificationConfigService,
  ) {}

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
