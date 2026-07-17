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
  Req,
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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { QuizService } from './quiz.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import {
  BulkQuizIdsDto,
  BulkUpdateQuizStatusDto,
  UpdateQuizDto,
  UpdateQuizStatusDto,
} from './dto/update-quiz.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditAction, QuizStatus } from '@prisma/client';
import { Audit } from '../audit/audit-log.decorator';

const quizUploadDir = join(process.cwd(), 'uploads', 'quizzes');
if (!existsSync(quizUploadDir)) {
  mkdirSync(quizUploadDir, { recursive: true });
}

@ApiTags('Quiz Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quizzes')
export class QuizController {
  constructor(private quizService: QuizService) {}

  @Get('courses')
  @ApiOperation({ summary: 'List all courses' })
  getCourses() {
    return this.quizService.getCourses();
  }

  @Post('courses')
  @Audit('COURSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a new course' })
  createCourse(@Body('title') title: string) {
    return this.quizService.createCourse(title);
  }

  @Post('upload-cover')
  @ApiOperation({ summary: 'Upload a public quiz preview / hero cover image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: quizUploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image uploads are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  uploadCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { url: null };
    return { url: `/uploads/quizzes/${file.filename}` };
  }

  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'Get quiz attempt details (answers revealed once finalized)' })
  getAttempt(@Param('attemptId') attemptId: string) {
    return this.quizService.getAttemptForStudent(attemptId);
  }

  @Post('attempts/:attemptId/heartbeat')
  @ApiOperation({
    summary:
      'Resilient timer heartbeat — syncs secondsRemaining, pauses on blur, auto-submits after 3 tab violations',
  })
  handleHeartbeat(
    @Param('attemptId') attemptId: string,
    @Body() body: HeartbeatDto,
    @Req() req: any,
  ) {
    return this.quizService.processHeartbeat(attemptId, body, {
      studentId: req.user.id,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List quizzes (paginated when page/pageSize provided)' })
  @ApiQuery({ name: 'status', required: false, enum: QuizStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  listQuizzes(
    @Query('status') status?: QuizStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (page === undefined && pageSize === undefined) {
      return this.quizService.listQuizzes(status);
    }
    return this.quizService.listQuizzesPaginated({
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Patch('bulk/status')
  @Audit('QUIZZES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Bulk update quiz status' })
  bulkUpdateStatus(@Body() dto: BulkUpdateQuizStatusDto) {
    return this.quizService.bulkUpdateStatus(dto.ids, dto.status);
  }

  @Post('bulk/delete')
  @Audit('QUIZZES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Bulk delete quizzes (archives if attempts exist)' })
  bulkDelete(@Body() dto: BulkQuizIdsDto) {
    return this.quizService.bulkDelete(dto.ids);
  }

  @Post()
  @Audit('QUIZZES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a multi-lingual quiz with questions' })
  createQuiz(@Body() dto: CreateQuizDto, @Req() req: any) {
    return this.quizService.createQuiz(dto, req.user.id);
  }

  @Get('me/in-progress')
  @ApiOperation({ summary: 'List in-progress quiz attempts for the logged-in student' })
  listMyInProgress(@Req() req: any) {
    return this.quizService.listInProgressAttempts({ studentId: req.user.id });
  }

  @Get('me/attempts')
  @ApiOperation({ summary: 'List completed quiz attempts for the logged-in student' })
  listMyCompletedAttempts(@Req() req: any) {
    return this.quizService.listCompletedAttempts({ studentId: req.user.id });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quiz by ID with questions (teacher/admin view)' })
  getQuiz(@Param('id') id: string) {
    return this.quizService.getQuizById(id);
  }

  @Put(':id')
  @Audit('QUIZZES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update quiz details and attached questions' })
  updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto) {
    return this.quizService.updateQuiz(id, dto);
  }

  @Patch(':id/status')
  @Audit('QUIZZES', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Update quiz status (Draft / Published / Archived)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuizStatusDto) {
    return this.quizService.updateQuizStatus(id, dto.status);
  }

  @Delete(':id')
  @Audit('QUIZZES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete quiz (archives if attempts exist)' })
  deleteQuiz(@Param('id') id: string) {
    return this.quizService.deleteQuiz(id);
  }

  @Get(':id/my-attempt')
  @ApiOperation({ summary: 'Get the current student latest attempt for a quiz, if any' })
  getMyAttempt(@Param('id') quizId: string, @Req() req: any) {
    return this.quizService.getMyAttempt(quizId, req.user.id);
  }

  @Post(':id/attempts')
  @ApiOperation({ summary: 'Start (or resume) a student quiz attempt' })
  startAttempt(@Param('id') quizId: string, @Req() req: any) {
    return this.quizService.startAttempt(quizId, req.user.id);
  }
}
