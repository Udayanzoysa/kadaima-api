import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ClassLocationType } from '@prisma/client';

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateClassScheduleDto {
  @ApiProperty({ description: '0 = Sunday .. 6 = Saturday', minimum: 0, maximum: 6 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @ApiProperty({ example: '09:00', description: '24-hour local start time HH:mm' })
  @IsString()
  @Matches(HH_MM_REGEX, { message: 'localStartTime must be in HH:mm 24-hour format' })
  localStartTime: string;

  @ApiProperty({ example: '11:00', description: '24-hour local end time HH:mm' })
  @IsString()
  @Matches(HH_MM_REGEX, { message: 'localEndTime must be in HH:mm 24-hour format' })
  localEndTime: string;

  @ApiProperty({ default: 'Asia/Colombo', required: false })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  timezone?: string;

  @ApiProperty({ enum: ClassLocationType, default: ClassLocationType.ONLINE, required: false })
  @IsEnum(ClassLocationType)
  @IsOptional()
  locationType?: ClassLocationType;

  @ApiProperty({ required: false, example: 'https://meet.google.com/abc-defg-hij or Hall A, Nugegoda' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  locationValue?: string | null;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string | null;
}

export class UpdateClassScheduleDto {
  @ApiProperty({ minimum: 0, maximum: 6, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  weekday?: number;

  @ApiProperty({ example: '09:00', required: false })
  @IsString()
  @Matches(HH_MM_REGEX, { message: 'localStartTime must be in HH:mm 24-hour format' })
  @IsOptional()
  localStartTime?: string;

  @ApiProperty({ example: '11:00', required: false })
  @IsString()
  @Matches(HH_MM_REGEX, { message: 'localEndTime must be in HH:mm 24-hour format' })
  @IsOptional()
  localEndTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  timezone?: string;

  @ApiProperty({ enum: ClassLocationType, required: false })
  @IsEnum(ClassLocationType)
  @IsOptional()
  locationType?: ClassLocationType;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  locationValue?: string | null;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string | null;
}

export class StudentTimetableQueryDto {
  @ApiProperty({ required: false, description: 'ISO date/datetime start of window' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false, description: 'ISO date/datetime end of window' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

