import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsIn } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    example: 'Support',
    description: 'Name of the access role',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 'Scoped',
    description: 'Access level of the role',
    enum: ['Full', 'Scoped'],
    required: false,
  })
  @IsString()
  @IsIn(['Full', 'Scoped'])
  @IsOptional()
  accessLevel?: string;

  @ApiProperty({
    example: 'Customer support access to resolve tickets',
    description: 'Detailed description of role responsibilities',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: ['uuid-1', 'uuid-2'],
    description: 'Permission Set IDs to link to this role',
    required: false,
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionSetIds?: string[];

  @ApiProperty({
    example: 'Jane Doe',
    description: 'Owner of the role definition',
    required: false,
  })
  @IsString()
  @IsOptional()
  owner?: string;

  @ApiProperty({
    example: 'Active',
    description: 'Current status of the role',
    enum: ['Active', 'Needs review'],
    required: false,
  })
  @IsString()
  @IsIn(['Active', 'Needs review'])
  @IsOptional()
  status?: string;
}
