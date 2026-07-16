import { Module } from '@nestjs/common';
import { NotificationConfigService } from '../settings/notification-config.service';
import { MailService } from './mail/mail.service';
import { SmsService } from './sms/sms.service';
import { NotificationDispatcher } from './notification.dispatcher';
import { NotificationListener } from './notification.listener';

@Module({
  providers: [
    NotificationConfigService,
    MailService,
    SmsService,
    NotificationDispatcher,
    NotificationListener,
  ],
  exports: [MailService, SmsService, NotificationDispatcher, NotificationConfigService],
})
export class NotificationModule {}
