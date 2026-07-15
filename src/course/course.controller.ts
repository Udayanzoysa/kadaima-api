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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CourseStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CourseService } from './course.service';
import {
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
  @ApiOperation({ summary: 'List all courses' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus })
  listCourses(@Query('status') status?: CourseStatus) {
    return this.courseService.listCourses(status);
  }

  @Post()
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
  @ApiOperation({ summary: 'Update course details' })
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.updateCourse(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update course status (Draft / Published / Archived)' })
  updateCourseStatus(@Param('id') id: string, @Body() dto: UpdateCourseStatusDto) {
    return this.courseService.updateCourseStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete course (archives if quizzes exist)' })
  deleteCourse(@Param('id') id: string) {
    return this.courseService.deleteCourse(id);
  }

  @Get(':courseId/modules')
  @ApiOperation({ summary: 'List modules for a course' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus })
  listModules(
    @Param('courseId') courseId: string,
    @Query('status') status?: CourseStatus,
  ) {
    return this.courseService.listModules(courseId, status);
  }

  @Post(':courseId/modules')
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
  @ApiOperation({ summary: 'Update module details' })
  updateModule(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.courseService.updateModule(courseId, id, dto);
  }

  @Patch(':courseId/modules/:id/status')
  @ApiOperation({ summary: 'Update module status (Draft / Published / Archived)' })
  updateModuleStatus(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModuleStatusDto,
  ) {
    return this.courseService.updateModuleStatus(courseId, id, dto.status);
  }

  @Delete(':courseId/modules/:id')
  @ApiOperation({ summary: 'Delete a module' })
  deleteModule(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
  ) {
    return this.courseService.deleteModule(courseId, id);
  }
}
