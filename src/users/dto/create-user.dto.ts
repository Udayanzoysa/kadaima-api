import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'new.member@weblabs.studio',
    description: 'User login email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'StrongP@ss123!',
    description: 'Initial login password',
    required: false,
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({
    example: 'Candice Wu',
    description: 'Display name of the user',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Customer Ops',
    description: 'Department or team assigned',
  })
  @IsString()
  @IsNotEmpty()
  team: string;

  @ApiProperty({
    example: 'role-uuid-1234',
    description: 'Workspace Custom Role ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  customRoleId?: string;

  @ApiProperty({
    example: 'Active',
    description: 'Initial account status',
    enum: ['Active', 'Inactive', 'Suspended'],
    required: false,
  })
  @IsString()
  @IsIn(['Active', 'Inactive', 'Suspended'])
  @IsOptional()
  status?: string;

  @ApiProperty({
    example: false,
    description: 'Can view other users',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  canViewOthers?: boolean;

  @ApiProperty({
    example: false,
    description: 'Can manage permissions / add users',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  canManagePermissions?: boolean;
}
