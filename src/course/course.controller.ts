import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AuditAction, CourseStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Audit } from '../audit/audit-log.decorator';
import { CourseService } from './course.service';
import {
  BulkCourseIdsDto,
  BulkModuleIdsDto,
  BulkUpdateCourseStatusDto,
  BulkUpdateModuleStatusDto,
  CreateCourseDto,
  CreateModuleDto,
  UpdateCourseDto,
  UpdateCourseStatusDto,
  UpdateModuleDto,
  UpdateModuleStatusDto,
} from './dto/course.dto';

@ApiTags('Course Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CourseController {
  constructor(private courseService: CourseService) {}

  @Get()
  @ApiOperation({ summary: 'List courses (paginated when page/pageSize provided)' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  listCourses(
    @Query('status') status?: CourseStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (page === undefined && pageSize === undefined) {
      return this.courseService.listCourses(status);
    }
    return this.courseService.listCoursesPaginated({
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Patch('bulk/status')
  @Audit('COURSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Bulk update course status' })
  bulkUpdateCourseStatus(@Body() dto: BulkUpdateCourseStatusDto) {
    return this.courseService.bulkUpdateCourseStatus(dto.ids, dto.status);
  }

  @Post('bulk/delete')
  @Audit('COURSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Bulk delete courses (archives if quizzes exist)' })
  bulkDeleteCourses(@Body() dto: BulkCourseIdsDto) {
    return this.courseService.bulkDeleteCourses(dto.ids);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export courses + modules backup (JSON or Excel)' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'xlsx'] })
  async exportBackup(
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'json';
    const file = await this.courseService.exportBackup(fmt);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Post('import')
  @Audit('COURSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Import courses + modules backup (JSON or Excel)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  importBackup(@UploadedFile() file: Express.Multer.File) {
    return this.courseService.importBackup(file);
  }

  @Post()
  @Audit('COURSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a multi-lingual course' })
  createCourse(@Body() dto: CreateCourseDto) {
    return this.courseService.createCourse(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get course by ID with modules' })
  getCourse(@Param('id') id: string) {
    return this.courseService.getCourse(id);
  }

  @Put(':id')
  @Audit('COURSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update course details' })
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.updateCourse(id, dto);
  }

  @Patch(':id/status')
  @Audit('COURSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Update course status (Draft / Published / Archived)' })
  updateCourseStatus(@Param('id') id: string, @Body() dto: UpdateCourseStatusDto) {
    return this.courseService.updateCourseStatus(id, dto.status);
  }

  @Delete(':id')
  @Audit('COURSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete course (archives if quizzes exist)' })
  deleteCourse(@Param('id') id: string) {
    return this.courseService.deleteCourse(id);
  }

  @Get(':courseId/modules')
  @ApiOperation({ summary: 'List modules for a course (paginated when page/pageSize provided)' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  listModules(
    @Param('courseId') courseId: string,
    @Query('status') status?: CourseStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (page === undefined && pageSize === undefined) {
      return this.courseService.listModules(courseId, status);
    }
    return this.courseService.listModulesPaginated(courseId, {
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Patch(':courseId/modules/bulk/status')
  @Audit('COURSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Bulk update module status' })
  bulkUpdateModuleStatus(
    @Param('courseId') courseId: string,
    @Body() dto: BulkUpdateModuleStatusDto,
  ) {
    return this.courseService.bulkUpdateModuleStatus(
      courseId,
      dto.ids,
      dto.status,
    );
  }

  @Post(':courseId/modules/bulk/delete')
  @Audit('COURSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Bulk delete modules' })
  bulkDeleteModules(
    @Param('courseId') courseId: string,
    @Body() dto: BulkModuleIdsDto,
  ) {
    return this.courseService.bulkDeleteModules(courseId, dto.ids);
  }

  @Get(':courseId/modules/export')
  @ApiOperation({ summary: 'Export modules for a course (JSON or Excel)' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'xlsx'] })
  async exportModulesBackup(
    @Param('courseId') courseId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'json';
    const file = await this.courseService.exportModulesBackup(courseId, fmt);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Post(':courseId/modules/import')
  @Audit('COURSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Import modules into a course (JSON or Excel)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  importModulesBackup(
    @Param('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courseService.importModulesBackup(courseId, file);
  }

  @Post(':courseId/modules')
  @Audit('COURSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a module under a course' })
  createModule(
    @Param('courseId') courseId: string,
    @Body() dto: CreateModuleDto,
  ) {
    return this.courseService.createModule(courseId, dto);
  }

  @Get(':courseId/modules/:id')
  @ApiOperation({ summary: 'Get module by ID' })
  getModule(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
  ) {
    return this.courseService.getModule(courseId, id);
  }

  @Put(':courseId/modules/:id')
  @Audit('COURSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update module details' })
  updateModule(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.courseService.updateModule(courseId, id, dto);
  }

  @Patch(':courseId/modules/:id/status')
  @Audit('COURSES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Update module status (Draft / Published / Archived)' })
  updateModuleStatus(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModuleStatusDto,
  ) {
    return this.courseService.updateModuleStatus(courseId, id, dto.status);
  }

  @Delete(':courseId/modules/:id')
  @Audit('COURSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete a module' })
  deleteModule(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
  ) {
    return this.courseService.deleteModule(courseId, id);
  }
}
