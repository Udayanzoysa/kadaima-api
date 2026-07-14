import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Candice Wu',
    description: 'Display name of the user',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 'Candice',
    description: 'First name of the user',
    required: false,
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    example: 'Wu',
    description: 'Last name of the user',
    required: false,
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    example: 'Acme Corp',
    description: 'Company name',
    required: false,
  })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'Phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({
    example: '123 Main St, Anytown, USA',
    description: 'Physical address',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: true,
    description: 'Whether 2FA is enabled',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isTwoFactorEnabled?: boolean;

  @ApiProperty({
    example: 'Customer Ops',
    description: 'Department or team assigned',
    required: false,
  })
  @IsString()
  @IsOptional()
  team?: string;

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
    description: 'Account status',
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

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  workspaceName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nicUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyBrUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  newPassword?: string;
}
