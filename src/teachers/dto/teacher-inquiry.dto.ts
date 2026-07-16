import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeacherInquiryStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeacherInquiryDto {
  @ApiProperty({ example: 'Saman Perera' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  studentName: string;

  @ApiProperty({ example: '0771234567', description: 'Sri Lankan mobile: 07XXXXXXXX' })
  @IsString()
  @Matches(/^07\d{8}$/, {
    message: 'Mobile number must be a valid Sri Lankan number (07XXXXXXXX)',
  })
  mobileNumber: string;

  @ApiPropertyOptional({ example: 'saman@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({ example: 'I would like more details about your A/L classes.' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateTeacherInquiryDto {
  @ApiPropertyOptional({ enum: TeacherInquiryStatus })
  @IsOptional()
  @IsEnum(TeacherInquiryStatus)
  status?: TeacherInquiryStatus;
}
