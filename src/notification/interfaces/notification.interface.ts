export type NotificationChannel = 'EMAIL' | 'SMS';

export interface SendNotificationPayload {
  channel: NotificationChannel;
  destination: string;
  subject?: string;
  message: string;
  /** Plain OTP for templating (never log in production). */
  code?: string;
  userName?: string;
}

export interface INotificationService {
  send(payload: SendNotificationPayload): Promise<void>;
}

export const NOTIFICATION_SERVICES = 'NOTIFICATION_SERVICES';
