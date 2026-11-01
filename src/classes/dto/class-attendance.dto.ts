import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, ClassSessionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';

export class CreateClassSessionDto {
  @ApiPropertyOptional({
    description:
      'When true, idempotently generates sessions from active recurring schedules over [from, to].',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  generateFromSchedule?: boolean;

  @ApiPropertyOptional({
    description: 'Start of generation window (YYYY-MM-DD or ISO-8601) when generateFromSchedule=true',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of generation window (YYYY-MM-DD or ISO-8601) when generateFromSchedule=true',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Manual session start timestamp in UTC (ISO-8601)',
    example: '2026-10-31T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAtUtc?: string;

  @ApiPropertyOptional({
    description: 'Manual session end timestamp in UTC (ISO-8601)',
    example: '2026-10-31T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  endsAtUtc?: string;

  @ApiPropertyOptional({
    description: 'Local calendar date (YYYY-MM-DD) in the session timezone',
    example: '2026-10-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'localDate must be formatted as YYYY-MM-DD.',
  })
  localDate?: string;

  @ApiPropertyOptional({ example: 'Asia/Colombo', default: 'Asia/Colombo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title?: LocalizedTextDto | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scheduleId?: string | null;
}

export class ListClassSessionsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ClassSessionStatus })
  @IsOptional()
  @IsEnum(ClassSessionStatus)
  status?: ClassSessionStatus;

  @ApiPropertyOptional({
    description: 'Automatically materialize recurring schedule occurrences in the requested window',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  autoGenerate?: boolean;
}

export class UpdateClassSessionDto {
  @ApiPropertyOptional({ enum: ClassSessionStatus })
  @IsOptional()
  @IsEnum(ClassSessionStatus)
  status?: ClassSessionStatus;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title?: LocalizedTextDto | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAtUtc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAtUtc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isLocked?: boolean;
}

export class MarkSessionAttendanceItemDto {
  @ApiProperty()
  @IsUUID()
  studentId!: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class PutSessionAttendanceDto {
  @ApiProperty({ type: [MarkSessionAttendanceItemDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MarkSessionAttendanceItemDto)
  records!: MarkSessionAttendanceItemDto[];

  @ApiPropertyOptional({
    description: 'Optional reason recorded in the correction audit trail when existing statuses change',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @ApiPropertyOptional({
    description: 'Mark the session status as COMPLETED when saving attendance',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  markSessionCompleted?: boolean;
}

export class ClassMonthlyAttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Optional month filter in YYYY-MM format',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format.',
  })
  month?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class StudentAttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Filter student attendance to a specific class batch',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

