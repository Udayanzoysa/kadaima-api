import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { PoliciesGuard } from '../auth/guards/policies.guard';

@Module({
  controllers: [CourseController],
  providers: [CourseService, AbilityFactory, PoliciesGuard],
  exports: [CourseService],
})
export class CourseModule {}
