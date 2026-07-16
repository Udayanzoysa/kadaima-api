import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export enum ForgotPasswordChannelDto {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export class ForgotPasswordDto {
  @ApiProperty({ enum: ForgotPasswordChannelDto, default: ForgotPasswordChannelDto.EMAIL })
  @IsEnum(ForgotPasswordChannelDto)
  channel: ForgotPasswordChannelDto;

  @ApiPropertyOptional({ example: 'student@example.com' })
  @ValidateIf((o) => o.channel === ForgotPasswordChannelDto.EMAIL)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '0771234567' })
  @ValidateIf((o) => o.channel === ForgotPasswordChannelDto.SMS)
  @IsString()
  phoneNumber?: string;
}
