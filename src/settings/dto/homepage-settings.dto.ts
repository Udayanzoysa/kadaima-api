import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class LocalizedHomepageTextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(800)
  en?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(800)
  si?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(800)
  ta?: string;
}

class HomepageHeroDto {
  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  badge?: LocalizedHomepageTextDto;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  title?: LocalizedHomepageTextDto;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  description?: LocalizedHomepageTextDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSecondaryCta?: boolean;
}

class HomepageCategoryDto {
  @ApiPropertyOptional()
  @IsUUID()
  courseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  maxQuizzes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  quizIds?: string[];
}

class HomepagePromoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  badge?: LocalizedHomepageTextDto;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  title?: LocalizedHomepageTextDto;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  description?: LocalizedHomepageTextDto;

  @ApiPropertyOptional({ type: LocalizedHomepageTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedHomepageTextDto)
  ctaLabel?: LocalizedHomepageTextDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaHref?: string;
}

export class UpdateHomepageSettingsDto {
  @ApiPropertyOptional({ type: HomepageHeroDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HomepageHeroDto)
  hero?: HomepageHeroDto;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxCategories?: number;

  @ApiPropertyOptional({ type: [HomepageCategoryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomepageCategoryDto)
  categories?: HomepageCategoryDto[];

  @ApiPropertyOptional({ type: HomepagePromoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HomepagePromoDto)
  promoSection?: HomepagePromoDto;
}
