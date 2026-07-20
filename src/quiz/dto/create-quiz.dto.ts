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
import { CreateQuestionDto } from './create-question.dto';
import { QuizSectionInputDto } from './quiz-section.dto';

export class CreateQuizDto {
  @ApiProperty()
  @IsUUID()
  courseId: string;

  @ApiProperty({ required: false, description: 'Optional module within the course' })
  @IsUUID()
  @IsOptional()
  moduleId?: string | null;

  @ApiProperty({
    enum: ContentLanguage,
    default: ContentLanguage.en,
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

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiProperty({ required: false, description: 'Public hero preview image URL' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @ApiProperty({ default: 30 })
  @IsInt()
  @Min(5)
  durationMinutes: number;

  @ApiProperty({ default: 70 })
  @IsInt()
  @Min(1)
  @Max(100)
  passingScorePercentage: number;

  @ApiProperty({
    default: 1,
    required: false,
    description: 'Total allowed attempts per student/guest (including the first)',
  })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  maxAttempts?: number;

  @ApiProperty({ enum: QuizStatus, default: QuizStatus.Draft })
  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  requiresUnlock?: boolean;

  @ApiProperty({ required: false, description: 'Price in LKR when requiresUnlock is true' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @ValidateIf((o: CreateQuizDto) => o.requiresUnlock === true)
  @Type(() => Number)
  @IsOptional()
  priceLkr?: number | null;

  /** Inline questions created in the bank and attached to this quiz. */
  @ApiProperty({ type: [CreateQuestionDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @IsOptional()
  questions?: CreateQuestionDto[];

  /** Existing bank question IDs to attach (order preserved). Ignored when `sections` is set. */
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  questionIds?: string[];

  /**
   * Instruction blocks with nested questions.
   * When provided, replaces flat `questionIds` linking (section order + within-section order).
   */
  @ApiProperty({ type: [QuizSectionInputDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => QuizSectionInputDto)
  @IsOptional()
  sections?: QuizSectionInputDto[];
}
