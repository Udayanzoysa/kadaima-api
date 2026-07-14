import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { QuizStatus } from '@prisma/client';
import { LocalizedTextDto } from './localized-text.dto';
import { CreateQuestionDto } from './create-question.dto';

export class CreateQuizDto {
  @ApiProperty()
  @IsUUID()
  courseId: string;

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

  @ApiProperty({ enum: QuizStatus, default: QuizStatus.Draft })
  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  /** Inline questions created in the bank and attached to this quiz. */
  @ApiProperty({ type: [CreateQuestionDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @IsOptional()
  questions?: CreateQuestionDto[];

  /** Existing bank question IDs to attach (order preserved). */
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  questionIds?: string[];
}
