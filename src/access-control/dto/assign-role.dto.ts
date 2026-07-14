import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({
    example: ['user-uuid-1', 'user-uuid-2'],
    description: 'List of User IDs to assign to the role',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
