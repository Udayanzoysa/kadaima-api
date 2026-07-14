import { IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitResponseDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  choiceId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  textResponse?: string;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  timeSpent: number;
}

export class SubmitAttemptDto {
  @ApiProperty({ type: [SubmitResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => SubmitResponseDto)
  responses: SubmitResponseDto[];
}
