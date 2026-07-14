import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { AbilityFactory } from '../auth/casl/ability.factory';

@Module({
  controllers: [DashboardController],
  providers: [AbilityFactory],
})
export class DashboardModule {}
