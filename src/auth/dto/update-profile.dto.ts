import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Saman Perera', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: '0771234567', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @ApiProperty({
    example: 'Royal College',
    required: false,
    description: 'School / institution',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  school?: string;
}
