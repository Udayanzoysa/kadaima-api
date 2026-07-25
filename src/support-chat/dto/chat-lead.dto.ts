import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateChatLeadDto {
  @ApiProperty({ example: 'Nimal Silva' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'nimal@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  mobileNumber: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  age: number;
}
