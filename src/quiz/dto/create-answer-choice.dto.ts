import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocalizedTextDto } from './localized-text.dto';

export class CreateAnswerChoiceDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  choiceText: LocalizedTextDto;

  @ApiPropertyOptional({
    description: 'Optional image URL for this choice (after upload)',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiProperty({ default: false })
  @IsBoolean()
  isCorrect: boolean;
}
