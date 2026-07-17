import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAuditSettingsDto {
  @ApiProperty({ example: true, description: 'Enable or disable audit logging platform-wide' })
  @IsBoolean()
  enabled: boolean;
}
