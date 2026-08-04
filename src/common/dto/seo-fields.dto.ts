import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Admin-authored search-engine overrides shared by publicly indexable entities.
 * Both fields are optional — a blank value means "keep deriving metadata from
 * the entity's own title/description".
 */
export class SeoFieldsDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Overrides the <title> tag on the public page. Aim for ~60 characters. Blank falls back to the entity title.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seoTitle?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Overrides <meta name="description"> on the public page. Aim for ~155 characters. Blank falls back to the derived description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;
}

/**
 * Blank strings from admin forms must persist as NULL so the public pages fall
 * back to derived metadata instead of emitting an empty tag.
 */
export function normalizeSeoField(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}
