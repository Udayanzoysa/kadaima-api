import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionStatus, QuestionType } from '@prisma/client';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';
import { CreateAnswerChoiceDto } from '../../quiz/dto/create-answer-choice.dto';

export class CreateBankQuestionDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  questionText: LocalizedTextDto;

  @ApiProperty({ enum: QuestionType, default: QuestionType.MCQ })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number;

  @ApiProperty({ enum: QuestionStatus, default: QuestionStatus.Draft })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @ApiPropertyOptional({ description: 'Prompt image URL (after upload)' })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Type config: contentFormat, acceptedAnswers, matchMode, correctNumber, tolerance, correctOrder, minWords…',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ type: [CreateAnswerChoiceDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAnswerChoiceDto)
  choices?: CreateAnswerChoiceDto[];
}

export class UpdateBankQuestionDto {
  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  questionText?: LocalizedTextDto;

  @ApiProperty({ enum: QuestionType, required: false })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number;

  @ApiProperty({ enum: QuestionStatus, required: false })
  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ type: [CreateAnswerChoiceDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => CreateAnswerChoiceDto)
  @IsOptional()
  choices?: CreateAnswerChoiceDto[];
}

export class UpdateQuestionStatusDto {
  @ApiProperty({ enum: QuestionStatus })
  @IsEnum(QuestionStatus)
  status: QuestionStatus;
}
