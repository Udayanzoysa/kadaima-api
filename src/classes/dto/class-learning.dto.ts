import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClassQuizAssignmentStatus,
  LessonResourceAccessPolicy,
  LessonResourceType,
  LessonStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';

export class CreateLessonDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  summary?: LocalizedTextDto | null;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  body?: LocalizedTextDto | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: LessonStatus, default: LessonStatus.Draft })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @ApiPropertyOptional({ example: '2026-11-01T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;
}

export class UpdateLessonDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  title?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  summary?: LocalizedTextDto | null;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  body?: LocalizedTextDto | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: LessonStatus })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;
}

export class CreateLessonResourceDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;

  @ApiProperty({ enum: LessonResourceType })
  @IsEnum(LessonResourceType)
  type!: LessonResourceType;

  @ApiPropertyOptional({
    description:
      'Safe HTTPS URL for VIDEO_EMBED or EXTERNAL_LINK resource types',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  externalUrl?: string | null;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  noteText?: LocalizedTextDto | null;

  @ApiPropertyOptional({
    enum: LessonResourceAccessPolicy,
    default: LessonResourceAccessPolicy.DOWNLOADABLE,
  })
  @IsOptional()
  @IsEnum(LessonResourceAccessPolicy)
  accessPolicy?: LessonResourceAccessPolicy;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class RequestResourceAccessDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Class batch ID context (required when student accesses a lesson resource)',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class MarkLessonProgressDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateClassQuizAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Canonical Kadaima Quiz ID' })
  @IsUUID()
  quizId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional Lesson ID within the course to attach this quiz to',
  })
  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description:
      'Optional class-specific localized display title (falls back to quiz.title)',
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  displayTitle?: LocalizedTextDto | null;

  @ApiPropertyOptional({ example: '2026-10-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({
    enum: ClassQuizAssignmentStatus,
    default: ClassQuizAssignmentStatus.Published,
  })
  @IsOptional()
  @IsEnum(ClassQuizAssignmentStatus)
  status?: ClassQuizAssignmentStatus;
}

export class UpdateClassQuizAssignmentDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  displayTitle?: LocalizedTextDto | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({ enum: ClassQuizAssignmentStatus })
  @IsOptional()
  @IsEnum(ClassQuizAssignmentStatus)
  status?: ClassQuizAssignmentStatus;
}

