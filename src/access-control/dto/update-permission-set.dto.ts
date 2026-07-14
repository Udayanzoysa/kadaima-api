import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionDefinitionDto } from './create-permission-set.dto';

export class UpdatePermissionSetDto {
  @ApiProperty({
    example: 'Users',
    description: 'Name of the permission set',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 'Allows full management of workspace users',
    description: 'Detailed description of the permission set responsibilities',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [PermissionDefinitionDto],
    description: 'List of fine-grained permissions included in this set',
    required: false,
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PermissionDefinitionDto)
  permissions?: PermissionDefinitionDto[];
}
