import {
  BadRequestException,
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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  LessonResourceAccessPolicy,
  LessonResourceType,
} from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Audit } from '../audit/audit-log.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateLessonDto,
  CreateLessonResourceDto,
  MarkLessonProgressDto,
  RequestResourceAccessDto,
  UpdateLessonDto,
} from './dto/class-learning.dto';
import { LessonsService } from './lessons.service';

function parseLocalizedField(
  raw: any,
  fallbackEn?: string,
): { en: string; si: string; ta: string } | undefined {
  if (!raw && !fallbackEn) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          en: String(parsed.en ?? fallbackEn ?? ''),
          si: String(parsed.si ?? ''),
          ta: String(parsed.ta ?? ''),
        };
      }
    } catch {
      return { en: raw, si: '', ta: '' };
    }
  }
  if (raw && typeof raw === 'object') {
    return {
      en: String(raw.en ?? fallbackEn ?? ''),
      si: String(raw.si ?? ''),
      ta: String(raw.ta ?? ''),
    };
  }
  return { en: String(fallbackEn ?? ''), si: '', ta: '' };
}

@ApiTags('Lessons & Protected Resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post('modules/:moduleId/lessons')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create an ordered lesson inside a course module' })
  createLesson(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateLessonDto,
    @Req() req: any,
  ) {
    return this.lessonsService.createLesson(moduleId, dto, req.user);
  }

  @Get('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'List lessons inside a course module' })
  listModuleLessons(
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.listModuleLessons(moduleId, req.user);
  }

  @Patch('lessons/:lessonId')
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update a lesson (title, body, status, sortOrder)' })
  updateLesson(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpdateLessonDto,
    @Req() req: any,
  ) {
    return this.lessonsService.updateLesson(lessonId, dto, req.user);
  }

  @Delete('lessons/:lessonId')
  @Audit('CLASSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete a lesson and its private resources' })
  deleteLesson(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.deleteLesson(lessonId, req.user);
  }

  @Post('lessons/:lessonId/resources')
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary:
      'Attach a resource (private PDF/document/image upload, video embed, external HTTPS link, or teacher note) to a lesson',
  })
  addLessonResource(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() rawBody: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    const title = parseLocalizedField(rawBody?.title, rawBody?.titleEn);
    if (!title?.en?.trim()) {
      throw new BadRequestException(
        'Resource title in English is required (minimum 2 characters).',
      );
    }

    const type = rawBody?.type as LessonResourceType;
    if (!type || !Object.values(LessonResourceType).includes(type)) {
      throw new BadRequestException('Valid resource type is required.');
    }

    const accessPolicy = rawBody?.accessPolicy
      ? (rawBody.accessPolicy as LessonResourceAccessPolicy)
      : LessonResourceAccessPolicy.DOWNLOADABLE;

    const dto: CreateLessonResourceDto = {
      title,
      type,
      externalUrl: rawBody?.externalUrl ?? null,
      noteText: parseLocalizedField(rawBody?.noteText, rawBody?.noteTextEn) ?? null,
      accessPolicy,
      sortOrder: rawBody?.sortOrder !== undefined ? Number(rawBody.sortOrder) : 0,
    };

    return this.lessonsService.addLessonResource(lessonId, dto, file, req.user);
  }

  @Delete('lessons/:lessonId/resources/:resourceId')
  @Audit('CLASSES', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete a lesson resource' })
  removeLessonResource(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Req() req: any,
  ) {
    return this.lessonsService.removeLessonResource(
      lessonId,
      resourceId,
      req.user,
    );
  }

  @Post('lessons/:lessonId/resources/:resourceId/access-url')
  @ApiOperation({
    summary:
      'Generate a short-lived user-bound signed access token/URL for a lesson resource after verifying enrollment & publication',
  })
  generateResourceAccessUrl(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Body() dto: RequestResourceAccessDto,
    @Req() req: any,
  ) {
    return this.lessonsService.generateResourceAccessUrl(
      lessonId,
      resourceId,
      dto,
      req.user,
    );
  }

  @Get('lessons/resources/:resourceId/stream')
  @ApiOperation({
    summary:
      'Stream a private lesson resource file using a short-lived user-bound signed token (denies copied URLs)',
  })
  async streamPrivateResource(
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Query('token') token: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.lessonsService.openResourceStream(
      resourceId,
      token,
      req.user,
    );
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${file.disposition}; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.buffer);
  }

  @Post('lessons/:lessonId/progress')
  @ApiOperation({
    summary: 'Mark or unmark a lesson as completed for the signed-in student',
  })
  markLessonProgress(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: MarkLessonProgressDto,
    @Req() req: any,
  ) {
    return this.lessonsService.markLessonProgress(lessonId, dto, req.user);
  }
}

