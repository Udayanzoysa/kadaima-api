import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AiQuizReviewDto {
  @ApiPropertyOptional({
    enum: ['en', 'si', 'ta'],
    description: 'Language for the AI review text',
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'si', 'ta'])
  locale?: 'en' | 'si' | 'ta';
}
