import { NotificationChannel } from '../interfaces/notification.interface';

export const PASSWORD_RESET_EVENT = 'password.reset.requested';

export class PasswordResetEvent {
  constructor(
    public readonly userId: string,
    public readonly channel: NotificationChannel,
    public readonly destination: string,
    public readonly plainToken: string,
    public readonly expiresAt: Date,
    public readonly userName?: string | null,
  ) {}
}
