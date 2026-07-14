import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterAccountDto {
  @ApiProperty({ example: 'teacher@school.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Nimal Silva', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
