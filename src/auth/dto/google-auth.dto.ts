import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from GIS / GoogleLogin' })
  @IsString()
  @MinLength(20)
  idToken: string;

  @ApiPropertyOptional({
    enum: ['student', 'teacher'],
    description:
      'For new accounts: creates student or teacher. For existing non-owner users signing up as teacher: assigns Teacher role + profile if missing.',
    default: 'student',
  })
  @IsOptional()
  @IsIn(['student', 'teacher'])
  accountType?: 'student' | 'teacher';
}
