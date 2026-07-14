import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'admin@myreseller.com',
    description: 'User login email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'Strong structural account password',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: 'Apex Telecommunications',
    description: 'Name of the company/workspace',
  })
  @IsString()
  @IsNotEmpty()
  workspaceName: string;

  @ApiProperty({
    example: 'b3f54a81-...',
    description: 'If registering under a reseller, provide their workspace ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
