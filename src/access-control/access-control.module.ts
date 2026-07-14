import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { RolesController } from './roles.controller';
import { PermissionSetsController } from './permission-sets.controller';
import { AccessReviewsController } from './access-reviews.controller';

@Module({
  controllers: [
    RolesController,
    PermissionSetsController,
    AccessReviewsController,
  ],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
