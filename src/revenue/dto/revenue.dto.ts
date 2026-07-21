import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TeacherPayoutStatus } from '@prisma/client';

export class CalculateRevenuePeriodDto {
  @ApiProperty({ example: 2026, description: 'Calendar year' })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 7, description: 'Calendar month 1–12' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({
    description: 'Recalculate even if period is already Settled (not Paid)',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdatePayoutStatusDto {
  @ApiProperty({ enum: TeacherPayoutStatus, example: TeacherPayoutStatus.Paid })
  @IsEnum(TeacherPayoutStatus)
  status: TeacherPayoutStatus;

  @ApiPropertyOptional({ description: 'Bank transfer / cheque reference' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}

export class UpsertTeacherPayoutProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;
}
