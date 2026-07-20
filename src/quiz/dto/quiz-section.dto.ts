import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { LocalizedTextDto } from './localized-text.dto';

/** Instruction block with nested question IDs (order preserved within the section). */
export class QuizSectionInputDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description: 'Instruction or comprehension passage for this section',
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  instruction: LocalizedTextDto;

  @ApiProperty({
    type: [String],
    description: 'Bank question IDs belonging to this section (order = display order)',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds: string[];
}
