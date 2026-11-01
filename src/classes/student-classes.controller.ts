import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { Audit } from '../audit/audit-log.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClassesService } from './classes.service';
import { LessonsService } from './lessons.service';
import { StudentRespondEnrollmentDto } from './dto/class-enrollment.dto';
import { StudentTimetableQueryDto } from './dto/class-schedule.dto';

@ApiTags('Student Classes & Timetable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('students/me')
export class StudentClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly lessonsService: LessonsService,
  ) {}

  @Get('classes')
  @ApiOperation({
    summary: 'List class enrollments for the signed-in student',
  })
  listMyClasses(@Req() req: any) {
    return this.classesService.listStudentClasses(req.user);
  }

  @Post('classes/:classId/respond')
  @Audit('CLASSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({
    summary:
      'Accept or decline a class invitation, or leave an enrolled/pending class',
  })
  respondToEnrollment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: StudentRespondEnrollmentDto,
    @Req() req: any,
  ) {
    return this.classesService.respondToStudentEnrollment(
      classId,
      dto,
      req.user,
    );
  }

  @Get('timetable')
  @ApiOperation({
    summary:
      'Get date-aware upcoming class session occurrences for the signed-in student',
  })
  getMyTimetable(
    @Query() query: StudentTimetableQueryDto,
    @Req() req: any,
  ) {
    return this.classesService.getStudentTimetable(req.user, query);
  }

  @Get('class-quizzes')
  @ApiOperation({
    summary:
      'List all published quiz assignments across the student active classes with attempt summaries',
  })
  getMyClassQuizzes(@Req() req: any) {
    return this.lessonsService.listStudentClassQuizzes(req.user);
  }

  @Get('dashboard-summary')
  @ApiOperation({
    summary:
      'Get unified Student Classroom LMS dashboard summary (classes, progress, quizzes, attendance, and tuition invoices)',
  })
  getMyDashboardSummary(@Req() req: any) {
    return this.classesService.getStudentDashboardSummary(req.user);
  }
}

