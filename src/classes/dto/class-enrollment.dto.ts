import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassEnrollmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClassInvitationDto {
  @ApiPropertyOptional({ example: 'Saturday Batch Intake Link' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'When true, students joining via this code enter PENDING state and require teacher approval.',
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({
    example: 168,
    description: 'Hours until expiry (default 168 = 7 days)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  expiresInHours?: number;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.000Z',
    description: 'Explicit ISO expiry date (overrides expiresInHours if set)',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Maximum uses allowed before the code is exhausted (null = unlimited)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUses?: number | null;
}

export class JoinClassByCodeDto {
  @ApiProperty({
    example: 'KDM-7F3A-9B2C',
    description: 'Plaintext class invitation code shared by the teacher',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  code!: string;
}

export class CreateClassEnrollmentDto {
  @ApiPropertyOptional({ description: 'Existing student User UUID' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    example: 'student@example.com',
    description: 'Existing student email (used when studentId is not provided)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    enum: ClassEnrollmentStatus,
    default: ClassEnrollmentStatus.ACTIVE,
    description: 'Initial status when added by teacher (ACTIVE or INVITED)',
  })
  @IsOptional()
  @IsEnum(ClassEnrollmentStatus)
  status?: ClassEnrollmentStatus;

  @ApiPropertyOptional({ example: 'STU-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  studentCode?: string;

  @ApiPropertyOptional({ example: 'Transferred from Sunday batch' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListClassEnrollmentsQueryDto {
  @ApiPropertyOptional({ enum: ClassEnrollmentStatus })
  @IsOptional()
  @IsEnum(ClassEnrollmentStatus)
  status?: ClassEnrollmentStatus;

  @ApiPropertyOptional({
    description: 'Search by student name, email, phone number, or student code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class UpdateClassEnrollmentDto {
  @ApiPropertyOptional({ enum: ClassEnrollmentStatus })
  @IsOptional()
  @IsEnum(ClassEnrollmentStatus)
  status?: ClassEnrollmentStatus;

  @ApiPropertyOptional({ example: 'STU-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  studentCode?: string | null;

  @ApiPropertyOptional({ example: 'Approved after verifying student ID' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class StudentRespondEnrollmentDto {
  @ApiProperty({ enum: ['ACCEPT', 'DECLINE', 'LEAVE'] })
  @IsIn(['ACCEPT', 'DECLINE', 'LEAVE'])
  action!: 'ACCEPT' | 'DECLINE' | 'LEAVE';
}

