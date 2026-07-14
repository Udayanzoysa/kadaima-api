import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class Verify2FaDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit time-based code from authenticator app',
  })
  @IsString()
  @MinLength(6)
  token: string;
}
