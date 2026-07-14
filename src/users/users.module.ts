import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AbilityFactory } from '../auth/casl/ability.factory';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AbilityFactory],
  exports: [UsersService],
})
export class UsersModule {}
