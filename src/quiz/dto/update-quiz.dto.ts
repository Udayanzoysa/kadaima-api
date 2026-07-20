import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguage, QuizStatus } from '@prisma/client';
import { LocalizedTextDto } from './localized-text.dto';
import { QuizSectionInputDto } from './quiz-section.dto';

export class UpdateQuizDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  moduleId?: string | null;

  @ApiProperty({
    enum: ContentLanguage,
    required: false,
    description: 'Deprecated: use `languages`. Kept as primary/default language.',
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  language?: ContentLanguage;

  @ApiProperty({
    enum: ContentLanguage,
    isArray: true,
    required: false,
    description:
      'Languages used in this quiz. Title, description, and all questions must include each selected language.',
  })
  @IsArray()
  @IsEnum(ContentLanguage, { each: true })
  @IsOptional()
  languages?: ContentLanguage[];

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  title?: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiProperty({ required: false, description: 'Public hero preview image URL' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(5)
  @IsOptional()
  durationMinutes?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  passingScorePercentage?: number;

  @ApiProperty({
    required: false,
    description: 'Total allowed attempts per student/guest (including the first)',
  })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  maxAttempts?: number;

  @ApiProperty({ enum: QuizStatus, required: false })
  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  requiresUnlock?: boolean;

  @ApiProperty({ required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @ValidateIf((o: UpdateQuizDto) => o.requiresUnlock === true)
  @Type(() => Number)
  @IsOptional()
  priceLkr?: number | null;

  /** Replace attached questions with these bank IDs (order = sortOrder). Ignored when `sections` is set. */
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  questionIds?: string[];

  /**
   * Replace instruction blocks + question links.
   * When provided, clears existing sections/links and recreates from this list.
   */
  @ApiProperty({ type: [QuizSectionInputDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => QuizSectionInputDto)
  @IsOptional()
  sections?: QuizSectionInputDto[];
}

export class UpdateQuizStatusDto {
  @ApiProperty({ enum: QuizStatus })
  @IsEnum(QuizStatus)
  status: QuizStatus;
}

export class BulkQuizIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BulkUpdateQuizStatusDto extends BulkQuizIdsDto {
  @ApiProperty({ enum: QuizStatus })
  @IsEnum(QuizStatus)
  status: QuizStatus;
}
