import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control/access-control.module';
import { UsersModule } from './users/users.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QuizModule } from './quiz/quiz.module';
import { GradingModule } from './grading/grading.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CourseModule } from './course/course.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationModule } from './notification/notification.module';
import { SettingsModule } from './settings/settings.module';
import { TeachersModule } from './teachers/teachers.module';
import { AuditModule } from './audit/audit.module';
import { SupportChatModule } from './support-chat/support-chat.module';
import { BackupModule } from './backup/backup.module';
import { RevenueModule } from './revenue/revenue.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    SettingsModule,
    NotificationModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    DashboardModule,
    QuizModule,
    CourseModule,
    TeachersModule,
    PaymentsModule,
    GradingModule,
    AnalyticsModule,
    AuditModule,
    SupportChatModule,
    BackupModule,
    RevenueModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
