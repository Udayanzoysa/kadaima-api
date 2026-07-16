import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ForgotPasswordChannelDto } from './forgot-password.dto';

export class ResetPasswordDto {
  @ApiProperty({ enum: ForgotPasswordChannelDto })
  @IsEnum(ForgotPasswordChannelDto)
  channel: ForgotPasswordChannelDto;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.channel === ForgotPasswordChannelDto.EMAIL)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.channel === ForgotPasswordChannelDto.SMS)
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ description: '6-digit OTP from email or SMS' })
  @IsString()
  @MinLength(4)
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
