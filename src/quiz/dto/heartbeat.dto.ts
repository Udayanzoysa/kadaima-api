import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class HeartbeatDto {
  @ApiProperty({ enum: ['active', 'paused'] })
  @IsIn(['active', 'paused'])
  status: 'active' | 'paused';

  @ApiProperty({ description: 'Client-side remaining seconds (advisory)' })
  @IsInt()
  @Min(0)
  secondsRemaining: number;

  @ApiProperty({ description: 'Client-side tab-switch violation count' })
  @IsInt()
  @Min(0)
  violationCount: number;

  @ApiPropertyOptional({
    description: 'Required for guest heartbeat endpoints',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  guestSessionId?: string;
}
