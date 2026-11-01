import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Audit } from '../audit/audit-log.decorator';
import { ClassesService } from './classes.service';
import { LessonsService } from './lessons.service';
import {
  CreateClassBatchDto,
  ListClassBatchesQueryDto,
  UpdateClassBatchDto,
} from './dto/class-batch.dto';
import {
  CreateClassEnrollmentDto,
  CreateClassInvitationDto,
  JoinClassByCodeDto,
  ListClassEnrollmentsQueryDto,
  UpdateClassEnrollmentDto,
} from './dto/class-enrollment.dto';
import {
  CreateClassQuizAssignmentDto,
  UpdateClassQuizAssignmentDto,
} from './dto/class-learning.dto';
import {
  CreateClassScheduleDto,
  UpdateClassScheduleDto,
} from './dto/class-schedule.dto';

@ApiTags('Classes & Batches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly lessonsService: LessonsService,
  ) {}

  @Post()
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a new class batch under an existing course' })
  createClass(@Body() dto: CreateClassBatchDto, @Req() req: any) {
    return this.classesService.createClass(dto, req.user);
  }

  @Post('join')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary: 'Join a class batch as a student using an invitation code',
  })
  joinClassByCode(@Body() dto: JoinClassByCodeDto, @Req() req: any) {
    return this.classesService.joinClassByCode(dto, req.user);
  }

  @Get()
  @ApiOperation({
    summary: 'List class batches scoped to the current teacher (or all for Super Admin)',
  })
  listClasses(@Query() query: ListClassBatchesQueryDto, @Req() req: any) {
    return this.classesService.listClasses(query, req.user);
  }

  @Get('dashboard-summary')
  @ApiOperation({
    summary:
      'Get Classroom LMS dashboard summary for Teacher or Super Admin (KPIs, today sessions, pending verifications, and reconciliation)',
  })
  getClassroomDashboardSummary(
    @Query('teacherUserId') teacherUserId: string | undefined,
    @Query('period') period: string | undefined,
    @Req() req: any,
  ) {
    return this.classesService.getClassroomDashboardSummary(req.user, {
      teacherUserId,
      period,
    });
  }

  @Get(':classId')
  @ApiOperation({
    summary:
      'Get class batch details (authorized for assigned teacher, Super Admin, or actively enrolled student)',
  })
  getClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.classesService.getClassById(classId, req.user);
  }

  @Patch(':classId')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update a class batch' })
  updateClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: UpdateClassBatchDto,
    @Req() req: any,
  ) {
    return this.classesService.updateClass(classId, dto, req.user);
  }

  @Post(':classId/archive')
  @Audit('CLASSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Archive a class batch (remains readable in historical records)' })
  archiveClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.classesService.archiveClass(classId, req.user);
  }

  @Post(':classId/duplicate')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary: 'Duplicate a class batch configuration and schedules (excludes students and payments)',
  })
  duplicateClass(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.classesService.duplicateClass(classId, req.user);
  }

  @Post(':classId/schedules')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Add a recurring schedule slot to a class batch' })
  addSchedule(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassScheduleDto,
    @Req() req: any,
  ) {
    return this.classesService.addSchedule(classId, dto, req.user);
  }

  @Get(':classId/schedules')
  @ApiOperation({ summary: 'List recurring schedule slots for a class batch' })
  listSchedules(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.classesService.listSchedules(classId, req.user);
  }

  @Patch(':classId/schedules/:scheduleId')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update a recurring schedule slot' })
  updateSchedule(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateClassScheduleDto,
    @Req() req: any,
  ) {
    return this.classesService.updateSchedule(
      classId,
      scheduleId,
      dto,
      req.user,
    );
  }

  @Delete(':classId/schedules/:scheduleId')
  @Audit('CLASSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Remove a recurring schedule slot' })
  removeSchedule(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Req() req: any,
  ) {
    return this.classesService.removeSchedule(classId, scheduleId, req.user);
  }

  // ==========================================================================
  // PHASE 2 — Invitations & Student Enrollments / Roster
  // ==========================================================================

  @Post(':classId/invitations')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Generate an expiring invitation code/link for a class batch (plaintext returned once)',
  })
  createInvitation(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassInvitationDto,
    @Req() req: any,
  ) {
    return this.classesService.createInvitation(classId, dto, req.user);
  }

  @Get(':classId/invitations')
  @ApiOperation({
    summary: 'List invitation codes for a class batch (masked hints only)',
  })
  listInvitations(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.classesService.listInvitations(classId, req.user);
  }

  @Post(':classId/invitations/:invitationId/revoke')
  @Audit('CLASSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Revoke an active class invitation code' })
  revokeInvitation(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Req() req: any,
  ) {
    return this.classesService.revokeInvitation(
      classId,
      invitationId,
      req.user,
    );
  }

  @Post(':classId/enrollments')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary: 'Add or invite an existing student into a class batch roster',
  })
  enrollStudent(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassEnrollmentDto,
    @Req() req: any,
  ) {
    return this.classesService.enrollStudent(classId, dto, req.user);
  }

  @Get(':classId/enrollments')
  @ApiOperation({
    summary: 'List class roster enrollments with status filter, search, and counts',
  })
  listEnrollments(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ListClassEnrollmentsQueryDto,
    @Req() req: any,
  ) {
    return this.classesService.listEnrollments(classId, query, req.user);
  }

  @Patch(':classId/enrollments/:enrollmentId')
  @Audit('CLASSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({
    summary:
      'Approve, reject, suspend, reactivate, or remove a student enrollment',
  })
  updateEnrollment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: UpdateClassEnrollmentDto,
    @Req() req: any,
  ) {
    return this.classesService.updateEnrollment(
      classId,
      enrollmentId,
      dto,
      req.user,
    );
  }

  // ==========================================================================
  // PHASE 3 — Learning Hierarchy (Modules -> Lessons -> Resources) & Quiz Reuse
  // ==========================================================================

  @Get(':classId/learning')
  @ApiOperation({
    summary:
      'Get ordered course modules, lessons, protected resource metadata, student completion progress, and assigned quizzes for a class batch',
  })
  getClassLearning(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.getClassLearning(classId, req.user);
  }

  @Post(':classId/quiz-assignments')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Assign an existing canonical Kadaima quiz to a class batch (and optional lesson) with availability dates',
  })
  createQuizAssignment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassQuizAssignmentDto,
    @Req() req: any,
  ) {
    return this.lessonsService.createQuizAssignment(classId, dto, req.user);
  }

  @Get(':classId/quiz-assignments')
  @ApiOperation({ summary: 'List quiz assignments for a class batch' })
  listClassQuizAssignments(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.listClassQuizAssignments(classId, req.user);
  }

  @Patch(':classId/quiz-assignments/:assignmentId')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update a class quiz assignment' })
  updateQuizAssignment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateClassQuizAssignmentDto,
    @Req() req: any,
  ) {
    return this.lessonsService.updateQuizAssignment(
      classId,
      assignmentId,
      dto,
      req.user,
    );
  }

  @Delete(':classId/quiz-assignments/:assignmentId')
  @Audit('CLASSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Remove a quiz assignment from a class batch' })
  removeQuizAssignment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.removeQuizAssignment(
      classId,
      assignmentId,
      req.user,
    );
  }
}

