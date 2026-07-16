import { Injectable, Logger } from '@nestjs/common';
import { NotificationConfigService } from '../../settings/notification-config.service';
import {
  INotificationService,
  SendNotificationPayload,
} from '../interfaces/notification.interface';

@Injectable()
export class SmsService implements INotificationService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly notificationConfig: NotificationConfigService) {}

  async send(payload: SendNotificationPayload): Promise<void> {
    if (payload.channel !== 'SMS') return;

    const body = payload.code
      ? `${payload.message} Code: ${payload.code}`
      : payload.message;
    const sms = await this.notificationConfig.getRuntimeSms();
    const provider = (sms.provider || 'HUTCH').toUpperCase();

    try {
      if (provider === 'NOTIFY_LK') {
        await this.sendNotifyLk(payload.destination, body, sms);
      } else {
        await this.sendHutch(payload.destination, body, sms);
      }
    } catch (err) {
      this.logger.error(
        `SMS send failed (${provider}) to ${payload.destination}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  private async sendNotifyLk(
    to: string,
    message: string,
    sms: Awaited<ReturnType<NotificationConfigService['getRuntimeSms']>>,
  ) {
    const { notifyUserId, notifyApiKey, notifySenderId, notifyApiUrl } = sms;

    if (!notifyUserId || !notifyApiKey) {
      this.logger.warn(`[dev-sms] Notify.lk not configured — to=${to} message=${message}`);
      return;
    }

    const url = new URL(notifyApiUrl || 'https://app.notify.lk/api/v1/send');
    url.searchParams.set('user_id', notifyUserId);
    url.searchParams.set('api_key', notifyApiKey);
    url.searchParams.set('sender_id', notifySenderId || 'NotifyDEMO');
    url.searchParams.set('to', to);
    url.searchParams.set('message', message);

    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Notify.lk error ${res.status}: ${text}`);
    }
  }

  private async sendHutch(
    to: string,
    message: string,
    sms: Awaited<ReturnType<NotificationConfigService['getRuntimeSms']>>,
  ) {
    const { hutchApiUrl, hutchUsername, hutchApiKey } = sms;

    if (!hutchUsername || !hutchApiKey) {
      this.logger.warn(`[dev-sms] Hutch not configured — to=${to} message=${message}`);
      return;
    }

    const res = await fetch(hutchApiUrl || 'https://api.hutch.lk/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hutchApiKey}`,
      },
      body: JSON.stringify({
        username: hutchUsername,
        to,
        message,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Hutch error ${res.status}: ${text}`);
    }
  }
}
