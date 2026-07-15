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
import { QuestionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuestionService } from './question.service';
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
  constructor(private questionService: QuestionService) {}

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
    // Backward compatible: without page → full list (quiz builder attach)
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
  @ApiOperation({ summary: 'Bulk update question status' })
  bulkUpdateStatus(@Body() dto: BulkUpdateQuestionStatusDto) {
    return this.questionService.bulkUpdateStatus(dto.ids, dto.status);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete questions (archives if in use)' })
  bulkDelete(@Body() dto: BulkQuestionIdsDto) {
    return this.questionService.bulkDelete(dto.ids);
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
  @ApiOperation({ summary: 'Update bank question (live across linked quizzes)' })
  update(@Param('id') id: string, @Body() dto: UpdateBankQuestionDto) {
    return this.questionService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update question status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuestionStatusDto) {
    return this.questionService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete question (archives if in use)' })
  delete(@Param('id') id: string) {
    return this.questionService.delete(id);
  }
}
