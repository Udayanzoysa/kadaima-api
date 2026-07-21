import {
  BadRequestException,
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
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Response } from 'express';
import { AuditAction, QuestionStatus, Action, Subject } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Audit } from '../audit/audit-log.decorator';
import { QuestionService } from './question.service';
import { AiQuestionImportService } from './ai-question-import.service';
import {
  CreateBankQuestionDto,
  UpdateBankQuestionDto,
  UpdateQuestionStatusDto,
  BulkQuestionIdsDto,
  BulkUpdateQuestionStatusDto,
} from './dto/bank-question.dto';

const uploadDir = join(process.cwd(), 'uploads', 'questions');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('Question Bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionController {
  constructor(
    private questionService: QuestionService,
    private aiImport: AiQuestionImportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List question bank (paginated)' })
  @ApiQuery({ name: 'status', required: false, enum: QuestionStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  list(
    @Query('status') status?: QuestionStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (page === undefined && pageSize === undefined) {
      return this.questionService.list(status);
    }
    return this.questionService.listPaginated({
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Patch('bulk/status')
  @Audit('QUESTIONS', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Bulk update question status' })
  bulkUpdateStatus(@Body() dto: BulkUpdateQuestionStatusDto) {
    return this.questionService.bulkUpdateStatus(dto.ids, dto.status);
  }

  @Post('bulk/delete')
  @UseGuards(PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, subject: Subject.QUIZZES })
  @Audit('QUESTIONS', AuditAction.DELETE)
  @ApiOperation({ summary: 'Permanently bulk-delete questions' })
  bulkDelete(@Body() dto: BulkQuestionIdsDto) {
    return this.questionService.bulkDelete(dto.ids);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export question bank backup (JSON or Excel)' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'xlsx'] })
  async exportBackup(
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'json';
    const file = await this.questionService.exportBackup(fmt);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Post('import')
  @Audit('QUESTIONS', AuditAction.CREATE)
  @ApiOperation({ summary: 'Import question bank backup (JSON or Excel)' })
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
  importBackup(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.questionService.importBackup(file, req.user.id);
  }

  @Post('ai/import-pdf')
  @ApiOperation({
    summary: 'Analyze an exam paper PDF with Gemini and return draft questions for review',
  })
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
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf');
        if (!ok) {
          return cb(new Error('Only PDF uploads are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async importPdfWithAi(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }
    return this.aiImport.importFromPdf(file);
  }

  @Post('upload-image')
  @ApiOperation({ summary: 'Upload a question prompt image (diagrams / spatial MCQ)' })
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
        destination: uploadDir,
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
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { url: null };
    }
    return { url: `/uploads/questions/${file.filename}` };
  }

  @Post()
  @Audit('QUESTIONS', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a bank question' })
  create(@Body() dto: CreateBankQuestionDto, @Req() req: any) {
    return this.questionService.create(dto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bank question by ID' })
  get(@Param('id') id: string) {
    return this.questionService.getById(id);
  }

  @Put(':id')
  @Audit('QUESTIONS', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update bank question (live across linked quizzes)' })
  update(@Param('id') id: string, @Body() dto: UpdateBankQuestionDto) {
    return this.questionService.update(id, dto);
  }

  @Patch(':id/status')
  @Audit('QUESTIONS', AuditAction.CHANGE_STATUS)
  @ApiOperation({ summary: 'Update question status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuestionStatusDto) {
    return this.questionService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, subject: Subject.QUIZZES })
  @Audit('QUESTIONS', AuditAction.DELETE)
  @ApiOperation({ summary: 'Permanently delete a question' })
  delete(@Param('id') id: string) {
    return this.questionService.delete(id);
  }
}
