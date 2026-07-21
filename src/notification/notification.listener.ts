import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PASSWORD_CHANGED_EVENT,
  PasswordChangedEvent,
} from './events/password-changed.event';
import {
  PASSWORD_RESET_EVENT,
  PasswordResetEvent,
} from './events/password-reset.event';
import {
  PAYMENT_FAILED_EVENT,
  PaymentFailedEvent,
} from './events/payment-failed.event';
import {
  PAYMENT_PAID_EVENT,
  PaymentPaidEvent,
} from './events/payment-paid.event';
import {
  SLIP_REVIEWED_EVENT,
  SlipReviewedEvent,
} from './events/slip-reviewed.event';
import {
  TEACHER_ACTIVATED_EVENT,
  TeacherActivatedEvent,
} from './events/teacher-activated.event';
import {
  TEACHER_PAYOUT_EVENT,
  TeacherPayoutEvent,
} from './events/teacher-payout.event';
import {
  USER_INVITE_EVENT,
  UserInviteEvent,
} from './events/user-invite.event';
import {
  USER_WELCOME_EVENT,
  UserWelcomeEvent,
} from './events/welcome.event';
import { NotificationDispatcher } from './notification.dispatcher';

/**
 * Async boundary: domain services emit; this listener dispatches EMAIL/SMS
 * off the request path. Failures are logged and never break the caller.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  @OnEvent(PASSWORD_RESET_EVENT, { async: true })
  async handlePasswordReset(event: PasswordResetEvent) {
    try {
      await this.dispatcher.dispatchPasswordReset(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver password reset via ${event.channel}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(PASSWORD_CHANGED_EVENT, { async: true })
  async handlePasswordChanged(event: PasswordChangedEvent) {
    try {
      await this.dispatcher.dispatchPasswordChanged(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver password-changed email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(USER_WELCOME_EVENT, { async: true })
  async handleWelcome(event: UserWelcomeEvent) {
    try {
      await this.dispatcher.dispatchWelcome(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver welcome email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(USER_INVITE_EVENT, { async: true })
  async handleInvite(event: UserInviteEvent) {
    try {
      await this.dispatcher.dispatchInvite(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver invite email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(TEACHER_ACTIVATED_EVENT, { async: true })
  async handleTeacherActivated(event: TeacherActivatedEvent) {
    try {
      await this.dispatcher.dispatchTeacherActivated(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver teacher-activated email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(PAYMENT_PAID_EVENT, { async: true })
  async handlePaymentPaid(event: PaymentPaidEvent) {
    try {
      await this.dispatcher.dispatchPaymentPaid(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver payment receipt to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(PAYMENT_FAILED_EVENT, { async: true })
  async handlePaymentFailed(event: PaymentFailedEvent) {
    try {
      await this.dispatcher.dispatchPaymentFailed(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver payment-failed email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(SLIP_REVIEWED_EVENT, { async: true })
  async handleSlipReviewed(event: SlipReviewedEvent) {
    try {
      await this.dispatcher.dispatchSlipReviewed(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver slip-reviewed email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(TEACHER_PAYOUT_EVENT, { async: true })
  async handleTeacherPayout(event: TeacherPayoutEvent) {
    try {
      await this.dispatcher.dispatchTeacherPayout(event);
    } catch (err) {
      this.logger.error(
        `Failed to deliver teacher payout email to ${event.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
