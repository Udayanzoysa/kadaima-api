import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [AbilityFactory, DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
