import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LocalizedTextDto {
  @ApiProperty({ example: 'What is the capital of Sri Lanka?' })
  @IsString()
  en: string;

  @ApiProperty({ example: 'ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?' })
  @IsString()
  si: string;

  @ApiProperty({ example: 'இலங்கையின் தலைநகரம் எது?' })
  @IsString()
  ta: string;
}

export class LocalizedTextField {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  text: LocalizedTextDto;
}
