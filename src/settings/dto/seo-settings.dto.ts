import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSeoSettingsDto {
  @ApiPropertyOptional({ example: 'Kadaima' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  siteName?: string;

  @ApiPropertyOptional({
    example: "Kadaima | Sri Lanka's Leading Online Exam & Quiz Portal",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional({
    example: 'G-80G4MMHK8B',
    description: 'Google Analytics 4 measurement ID (G-XXXXXXXX)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  googleAnalyticsId?: string;

  @ApiPropertyOptional({ description: 'Absolute or site-relative Open Graph image URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImageUrl?: string;

  @ApiPropertyOptional({ example: 'online exam, quiz, scholarship, Sri Lanka' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  keywords?: string;
}
