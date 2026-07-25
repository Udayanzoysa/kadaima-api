import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateChatLeadDto {
  @ApiProperty({ example: 'Nimal Silva' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'nimal@gmail.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  mobileNumber: string;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  age?: number;

  @ApiProperty({ example: 'Royal College', required: false })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiProperty({ example: 'Chatbot', required: false })
  @IsOptional()
  @IsString()
  tag?: string;
}
