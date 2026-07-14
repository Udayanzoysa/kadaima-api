import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProgressResponseItemDto {
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

export class SaveGuestProgressDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  guestSessionId: string;

  @ApiProperty({ type: [ProgressResponseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgressResponseItemDto)
  responses: ProgressResponseItemDto[];
}
