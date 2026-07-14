import { IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { LocalizedTextDto } from './localized-text.dto';

export class CreateAnswerChoiceDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  choiceText: LocalizedTextDto;

  @ApiProperty({ default: false })
  @IsBoolean()
  isCorrect: boolean;
}
