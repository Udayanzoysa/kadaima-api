import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartGuestAttemptDto {
  @ApiProperty({ example: 'usr_9x82j3...' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId: string;

  @ApiProperty({ example: 'Saman Perera' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  studentName: string;

  @ApiProperty({ example: 'Royal College Colombo' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  school: string;

  @ApiProperty({ example: '0771234567', description: 'Sri Lankan mobile: 07XXXXXXXX' })
  @IsString()
  @Matches(/^07\d{8}$/, {
    message: 'Mobile number must be a valid Sri Lankan number (07XXXXXXXX)',
  })
  mobileNumber: string;

  @ApiProperty({ required: false, example: 'saman@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
