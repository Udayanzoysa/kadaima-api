import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum SmtpEncryptionDto {
  SSL = 'SSL',
  STARTTLS = 'STARTTLS',
  NONE = 'NONE',
}

export enum SmsProviderDto {
  HUTCH = 'HUTCH',
  NOTIFY_LK = 'NOTIFY_LK',
}

export class UpdateSmtpSettingsDto {
  @ApiProperty({ example: 'mail.privateemail.com' })
  @IsString()
  host: string;

  @ApiProperty({ example: 465, description: '465 (SSL) or 587 (STARTTLS)' })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ enum: SmtpEncryptionDto, example: SmtpEncryptionDto.SSL })
  @IsEnum(SmtpEncryptionDto)
  encryption: SmtpEncryptionDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  user?: string;

  @ApiPropertyOptional({
    description: 'Leave empty to keep the existing password',
  })
  @IsString()
  @IsOptional()
  pass?: string;

  @ApiPropertyOptional({ example: 'noreply@yourdomain.com' })
  @IsString()
  @IsOptional()
  from?: string;
}

export class UpdateSmsSettingsDto {
  @ApiProperty({ enum: SmsProviderDto })
  @IsEnum(SmsProviderDto)
  provider: SmsProviderDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  hutchApiUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  hutchUsername?: string;

  @ApiPropertyOptional({ description: 'Leave empty to keep existing key' })
  @IsString()
  @IsOptional()
  hutchApiKey?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notifyUserId?: string;

  @ApiPropertyOptional({ description: 'Leave empty to keep existing key' })
  @IsString()
  @IsOptional()
  notifyApiKey?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notifySenderId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notifyApiUrl?: string;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ type: UpdateSmtpSettingsDto })
  @ValidateNested()
  @Type(() => UpdateSmtpSettingsDto)
  @IsOptional()
  smtp?: UpdateSmtpSettingsDto;

  @ApiPropertyOptional({ type: UpdateSmsSettingsDto })
  @ValidateNested()
  @Type(() => UpdateSmsSettingsDto)
  @IsOptional()
  sms?: UpdateSmsSettingsDto;
}

export class TestEmailDto {
  @ApiProperty()
  @IsEmail()
  to: string;
}

export class TestSmsDto {
  @ApiProperty({ example: '0771234567' })
  @IsString()
  to: string;
}
