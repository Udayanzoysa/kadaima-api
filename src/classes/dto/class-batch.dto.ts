import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ClassBatchStatus,
  ClassTeacherScope,
  ContentLanguage,
} from '@prisma/client';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';

export class ClassTeacherAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  teacherId: string;

  @ApiProperty({ enum: ClassTeacherScope, default: ClassTeacherScope.INSTRUCTOR, required: false })
  @IsEnum(ClassTeacherScope)
  @IsOptional()
  permissionScope?: ClassTeacherScope;
}

export class CreateClassBatchDto {
  @ApiProperty({ format: 'uuid', description: 'Existing Course ID' })
  @IsUUID()
  courseId: string;

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto | null;

  @ApiProperty({ required: false, example: 'Grade 10' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  grade?: string | null;

  @ApiProperty({ required: false, example: 'Mathematics' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  subject?: string | null;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  academicYear: number;

  @ApiProperty({
    enum: ContentLanguage,
    isArray: true,
    default: [ContentLanguage.en],
    required: false,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ContentLanguage, { each: true })
  @IsOptional()
  languages?: ContentLanguage[];

  @ApiProperty({ required: false, example: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  capacity?: number | null;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @ApiProperty({
    enum: ClassBatchStatus,
    default: ClassBatchStatus.Draft,
    required: false,
  })
  @IsEnum(ClassBatchStatus)
  @IsOptional()
  status?: ClassBatchStatus;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Super admin only: assign a specific primary teacher',
  })
  @IsUUID()
  @IsOptional()
  primaryTeacherId?: string;

  @ApiProperty({ type: [ClassTeacherAssignmentDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherAssignmentDto)
  @IsOptional()
  coTeachers?: ClassTeacherAssignmentDto[];
}

export class UpdateClassBatchDto {
  @ApiProperty({ format: 'uuid', required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  title?: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto | null;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  grade?: string | null;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  subject?: string | null;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  @IsOptional()
  academicYear?: number;

  @ApiProperty({ enum: ContentLanguage, isArray: true, required: false })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ContentLanguage, { each: true })
  @IsOptional()
  languages?: ContentLanguage[];

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  capacity?: number | null;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @ApiProperty({ enum: ClassBatchStatus, required: false })
  @IsEnum(ClassBatchStatus)
  @IsOptional()
  status?: ClassBatchStatus;

  @ApiProperty({ type: [ClassTeacherAssignmentDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassTeacherAssignmentDto)
  @IsOptional()
  coTeachers?: ClassTeacherAssignmentDto[];
}

export class ListClassBatchesQueryDto {
  @ApiProperty({ enum: ClassBatchStatus, required: false })
  @IsEnum(ClassBatchStatus)
  @IsOptional()
  status?: ClassBatchStatus;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  grade?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  subject?: string;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  @IsOptional()
  academicYear?: number;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  search?: string;

  @ApiProperty({ required: false, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiProperty({ required: false, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;
}

