import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RedeemVoucherDto {
  @ApiProperty()
  @IsUUID()
  quizId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class CreateVoucherDto {
  @ApiProperty({ example: 'GRADE5-2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({ description: 'Null = any locked quiz' })
  @IsOptional()
  @IsUUID()
  quizId?: string | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVoucherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class SubmitSlipDto {
  @ApiProperty()
  @IsUUID()
  quizId: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewSlipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
