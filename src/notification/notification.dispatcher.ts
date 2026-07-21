import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordChangedEvent } from './events/password-changed.event';
import { PasswordResetEvent } from './events/password-reset.event';
import { PaymentFailedEvent } from './events/payment-failed.event';
import { PaymentPaidEvent } from './events/payment-paid.event';
import { SlipReviewedEvent } from './events/slip-reviewed.event';
import { TeacherActivatedEvent } from './events/teacher-activated.event';
import { TeacherPayoutEvent } from './events/teacher-payout.event';
import { UserInviteEvent } from './events/user-invite.event';
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

  async dispatchInvite(event: UserInviteEvent) {
    await this.mailService.sendInvite({
      to: event.email,
      userName: event.userName,
      invitedByName: event.invitedByName,
    });
  }

  async dispatchTeacherActivated(event: TeacherActivatedEvent) {
    await this.mailService.sendTeacherActivated({
      to: event.email,
      userName: event.userName,
      publicPagePath: event.publicPagePath,
    });
  }

  async dispatchPasswordChanged(event: PasswordChangedEvent) {
    await this.mailService.sendPasswordChanged({
      to: event.email,
      userName: event.userName,
      reason: event.reason,
    });
  }

  async dispatchPaymentPaid(event: PaymentPaidEvent) {
    await this.mailService.sendPaymentReceipt({
      to: event.email,
      userName: event.userName,
      purpose: event.purpose,
      amountLkr: event.amountLkr,
      orderId: event.orderId,
      quizTitle: event.quizTitle,
      currency: event.currency,
    });
  }

  async dispatchPaymentFailed(event: PaymentFailedEvent) {
    await this.mailService.sendPaymentFailed({
      to: event.email,
      userName: event.userName,
      purpose: event.purpose,
      amountLkr: event.amountLkr,
      orderId: event.orderId,
      status: event.status,
      quizTitle: event.quizTitle,
      currency: event.currency,
    });
  }

  async dispatchSlipReviewed(event: SlipReviewedEvent) {
    await this.mailService.sendSlipReviewed({
      to: event.email,
      userName: event.userName,
      status: event.status,
      quizTitle: event.quizTitle,
      note: event.note,
    });
  }

  async dispatchTeacherPayout(event: TeacherPayoutEvent) {
    await this.mailService.sendTeacherPayout({
      to: event.email,
      userName: event.userName,
      status: event.status,
      amountLkr: event.amountLkr,
      periodLabel: event.periodLabel,
      attemptCount: event.attemptCount,
      reference: event.reference,
      currency: event.currency,
    });
  }
}
