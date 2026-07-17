import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PASSWORD_RESET_EVENT,
  PasswordResetEvent,
} from './events/password-reset.event';
import {
  TEACHER_ACTIVATED_EVENT,
  TeacherActivatedEvent,
} from './events/teacher-activated.event';
import {
  USER_WELCOME_EVENT,
  UserWelcomeEvent,
} from './events/welcome.event';
import { NotificationDispatcher } from './notification.dispatcher';

/**
 * Async boundary: AuthService emits; this listener dispatches EMAIL/SMS
 * off the request path. Swap this for a BullMQ producer later without
 * changing AuthService.
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
}
