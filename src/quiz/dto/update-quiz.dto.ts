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

export class UpdateQuizDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

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

  @ApiProperty({ enum: QuizStatus, required: false })
  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  /** Replace attached questions with these bank IDs (order = sortOrder). */
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  questionIds?: string[];
}

export class UpdateQuizStatusDto {
  @ApiProperty({ enum: QuizStatus })
  @IsEnum(QuizStatus)
  status: QuizStatus;
}
