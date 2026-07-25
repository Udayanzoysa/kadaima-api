import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportChatController } from './support-chat.controller';
import { SupportChatService } from './support-chat.service';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { PoliciesGuard } from '../auth/guards/policies.guard';

@Module({
  imports: [SettingsModule, PrismaModule],
  controllers: [SupportChatController],
  providers: [SupportChatService, AbilityFactory, PoliciesGuard],
})
export class SupportChatModule {}
