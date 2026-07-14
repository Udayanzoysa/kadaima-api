import { IsEnum, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';
import { LocalizedTextDto } from './localized-text.dto';
import { CreateAnswerChoiceDto } from './create-answer-choice.dto';

export class CreateQuestionDto {
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

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ type: [CreateAnswerChoiceDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateAnswerChoiceDto)
  choices: CreateAnswerChoiceDto[];
}
