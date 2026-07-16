import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';
import { ForgotPasswordChannelDto } from './forgot-password.dto';

export class ValidateResetTokenDto {
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

  @ApiProperty({ description: 'Reset code from email link or SMS' })
  @IsString()
  @MinLength(4)
  token: string;
}
