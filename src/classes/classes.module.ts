import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AttendanceController } from './attendance.controller';
import { BillingController } from './billing.controller';
import { ClassesController } from './classes.controller';
import { LessonsController } from './lessons.controller';
import { StudentClassesController } from './student-classes.controller';
import { AttendanceService } from './attendance.service';
import { BillingService } from './billing.service';
import { ClassesService } from './classes.service';
import { LessonsService } from './lessons.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    ClassesController,
    LessonsController,
    AttendanceController,
    BillingController,
    StudentClassesController,
  ],
  providers: [ClassesService, LessonsService, AttendanceService, BillingService],
  exports: [ClassesService, LessonsService, AttendanceService, BillingService],
})
export class ClassesModule {}

