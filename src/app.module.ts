import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control/access-control.module';
import { UsersModule } from './users/users.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QuizModule } from './quiz/quiz.module';
import { GradingModule } from './grading/grading.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CourseModule } from './course/course.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    DashboardModule,
    QuizModule,
    CourseModule,
    PaymentsModule,
    GradingModule,
    AnalyticsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
