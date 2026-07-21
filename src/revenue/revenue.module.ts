import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { RevenueController } from './revenue.controller';
import { TeacherEarningsController } from './teacher-earnings.controller';
import { RevenueService } from './revenue.service';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [RevenueController, TeacherEarningsController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
