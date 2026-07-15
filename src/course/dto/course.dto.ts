import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CourseStatus } from '@prisma/client';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';

export class CreateCourseDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiProperty({ enum: CourseStatus, default: CourseStatus.Draft, required: false })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;
}

export class UpdateCourseDto {
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

  @ApiProperty({ enum: CourseStatus, required: false })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;
}

export class UpdateCourseStatusDto {
  @ApiProperty({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  status: CourseStatus;
}

export class CreateModuleDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto, required: false })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiProperty({ enum: CourseStatus, default: CourseStatus.Draft, required: false })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;

  @ApiProperty({ default: 0, required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateModuleDto {
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

  @ApiProperty({ enum: CourseStatus, required: false })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateModuleStatusDto {
  @ApiProperty({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  status: CourseStatus;
}
