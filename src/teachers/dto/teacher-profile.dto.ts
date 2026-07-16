import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeacherPosterPlacement, TeacherQuizVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const TEACHER_PAGE_SECTION_IDS = [
  'hero',
  'classes',
  'quizzes',
  'about',
  'contact',
] as const;

export type TeacherPageSectionId = (typeof TEACHER_PAGE_SECTION_IDS)[number];

export class TeacherPageSectionDto {
  @ApiProperty({ enum: TEACHER_PAGE_SECTION_IDS })
  @IsIn(TEACHER_PAGE_SECTION_IDS)
  id: TeacherPageSectionId;

  @ApiProperty()
  @IsBoolean()
  visible: boolean;
}

export class TeacherPageLayoutDto {
  @ApiProperty({ type: [TeacherPageSectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherPageSectionDto)
  @ArrayMinSize(1)
  sections: TeacherPageSectionDto[];
}

export class ReorderIdsDto {
  @ApiProperty({ type: [String], description: 'Ordered list of item IDs' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  ids: string[];
}

export class UpdateTeacherProfileDto {
  @ApiPropertyOptional({ example: 'kasun' })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(64)
  slug?: string;

  @ApiPropertyOptional({ example: 'Kasun Perera' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ example: 'A/L Maths with Kasun' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'About section text on the public page' })
  @IsString()
  @IsOptional()
  aboutText?: string | null;

  @ApiPropertyOptional({ description: 'Contact section text on the public page' })
  @IsString()
  @IsOptional()
  contactText?: string | null;

  @ApiPropertyOptional({ description: 'Mobile / phone number shown on Contact' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  contactPhone?: string | null;

  @ApiPropertyOptional({ description: 'WhatsApp chat or group link' })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  contactWhatsappUrl?: string | null;

  @ApiPropertyOptional({ description: 'Class location / address' })
  @IsString()
  @IsOptional()
  contactAddress?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sideBannerUrl?: string | null;

  @ApiPropertyOptional({ description: 'Publish the public /t/{slug} page' })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    enum: TeacherQuizVisibility,
    description: 'ALL = every quiz you created; SELECTED = only selectedQuizIds',
  })
  @IsEnum(TeacherQuizVisibility)
  @IsOptional()
  quizVisibility?: TeacherQuizVisibility;

  @ApiPropertyOptional({
    type: [String],
    description: 'Quiz IDs to show when quizVisibility is SELECTED',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedQuizIds?: string[];

  @ApiPropertyOptional({
    type: TeacherPageLayoutDto,
    description: 'Page-builder section visibility and order',
  })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => TeacherPageLayoutDto)
  pageLayout?: TeacherPageLayoutDto | null;
}

export class UpsertTeacherBannerDto {
  @ApiProperty()
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ description: 'Hero overlay supporting text' })
  @IsString()
  @IsOptional()
  subtitle?: string | null;

  @ApiPropertyOptional({ example: 'Browse Resources' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  ctaLabel?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpsertTeacherClassDto {
  @ApiProperty({ example: 'Grade 12 Combined Maths' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ example: '8:00 AM - 12:00 PM' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  scheduleTime?: string | null;

  @ApiPropertyOptional({ example: 'Colombo Main Hall' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({ example: 'Jan 15, 2025' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  classDate?: string | null;

  @ApiPropertyOptional({ example: 'LKR 5,000' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  feeLabel?: string | null;

  @ApiPropertyOptional({ example: 'https://chat.whatsapp.com/...' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  whatsappGroupUrl?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpsertTeacherPosterDto {
  @ApiProperty()
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string | null;

  @ApiProperty({ enum: TeacherPosterPlacement, example: TeacherPosterPlacement.MIDDLE })
  @IsEnum(TeacherPosterPlacement)
  placement: TeacherPosterPlacement;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
