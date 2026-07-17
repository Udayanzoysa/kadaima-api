import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetEvent } from './events/password-reset.event';
import { TeacherActivatedEvent } from './events/teacher-activated.event';
import { UserWelcomeEvent } from './events/welcome.event';
import { MailService } from './mail/mail.service';
import { SmsService } from './sms/sms.service';

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly config: ConfigService,
  ) {}

  async dispatchPasswordReset(event: PasswordResetEvent) {
    const ttlSeconds = this.config.get<number>('RESET_TOKEN_TTL') ?? 600;
    const expiresMinutes = Math.max(1, Math.round(ttlSeconds / 60));

    if (event.channel === 'EMAIL') {
      await this.mailService.send({
        channel: 'EMAIL',
        destination: event.destination,
        subject: 'Reset your Kadaima Educational password',
        message: `Password reset link expires in ${expiresMinutes} minutes.`,
        code: event.plainToken,
        userName: event.userName || undefined,
      });
      return;
    }

    await this.smsService.send({
      channel: 'SMS',
      destination: event.destination,
      message: 'Kadaima Educational password reset.',
      code: event.plainToken,
    });
  }

  async dispatchWelcome(event: UserWelcomeEvent) {
    await this.mailService.sendWelcome({
      to: event.email,
      userName: event.userName,
      accountType: event.accountType,
    });
  }

  async dispatchTeacherActivated(event: TeacherActivatedEvent) {
    await this.mailService.sendTeacherActivated({
      to: event.email,
      userName: event.userName,
      publicPagePath: event.publicPagePath,
    });
  }
}
