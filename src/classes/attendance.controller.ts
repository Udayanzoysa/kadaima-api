import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { Audit } from '../audit/audit-log.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import {
  ClassMonthlyAttendanceQueryDto,
  CreateClassSessionDto,
  ListClassSessionsQueryDto,
  PutSessionAttendanceDto,
  StudentAttendanceQueryDto,
  UpdateClassSessionDto,
} from './dto/class-attendance.dto';

@ApiTags('Class Sessions & Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('classes/:classId/sessions')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Generate class sessions from recurring schedule or create a manual class session',
  })
  createOrGenerateSessions(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassSessionDto,
    @Req() req: any,
  ) {
    return this.attendanceService.createOrGenerateSessions(
      classId,
      dto,
      req.user,
    );
  }

  @Get('classes/:classId/sessions')
  @ApiOperation({
    summary: 'List class sessions in a date window with attendance status counts',
  })
  listClassSessions(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ListClassSessionsQueryDto,
    @Req() req: any,
  ) {
    return this.attendanceService.listClassSessions(classId, query, req.user);
  }

  @Patch('classes/:classId/sessions/:sessionId')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary: 'Update, cancel (with reason), reschedule, or lock/unlock a class session',
  })
  updateClassSession(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateClassSessionDto,
    @Req() req: any,
  ) {
    return this.attendanceService.updateClassSession(
      classId,
      sessionId,
      dto,
      req.user,
    );
  }

  @Get('sessions/:sessionId/attendance')
  @ApiOperation({
    summary:
      'Get full class session roster merged with attendance records and correction audit history',
  })
  getSessionAttendance(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: any,
  ) {
    return this.attendanceService.getSessionAttendance(sessionId, req.user);
  }

  @Put('sessions/:sessionId/attendance')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Idempotently save/bulk-mark attendance for a class session and record correction audit entries',
  })
  putSessionAttendance(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: PutSessionAttendanceDto,
    @Req() req: any,
  ) {
    return this.attendanceService.putSessionAttendance(
      sessionId,
      dto,
      req.user,
    );
  }

  @Get('classes/:classId/attendance')
  @ApiOperation({
    summary:
      'Get teacher monthly/class attendance summary with consistent percentage metrics',
  })
  getClassAttendanceSummary(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ClassMonthlyAttendanceQueryDto,
    @Req() req: any,
  ) {
    return this.attendanceService.getClassAttendanceSummary(
      classId,
      query,
      req.user,
    );
  }

  @Get('classes/:classId/attendance/export')
  @ApiOperation({
    summary: 'Export class attendance summary as CSV',
  })
  async exportClassAttendanceCsv(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ClassMonthlyAttendanceQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { fileName, csv } =
      await this.attendanceService.exportClassAttendanceCsv(
        classId,
        query,
        req.user,
      );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(csv);
  }

  @Get('students/me/attendance')
  @ApiOperation({
    summary:
      'Get signed-in student attendance percentage summary and session-by-session history',
  })
  getStudentAttendance(
    @Query() query: StudentAttendanceQueryDto,
    @Req() req: any,
  ) {
    return this.attendanceService.getStudentAttendance(req.user, query);
  }
}

