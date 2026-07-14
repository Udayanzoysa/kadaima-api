import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Action, Subject } from '@prisma/client';

export class PermissionDefinitionDto {
  @ApiProperty({ example: 'CREATE', enum: Action, description: 'Action type' })
  @IsEnum(Action)
  action: Action;

  @ApiProperty({
    example: 'CAMPAIGN',
    enum: Subject,
    description: 'Resource subject type',
  })
  @IsEnum(Subject)
  subject: Subject;

  @ApiProperty({
    example: { userId: '{{userId}}' },
    description: 'Optional conditions rule styling (JSON)',
    required: false,
  })
  @IsOptional()
  conditions?: any;
}

export class CreatePermissionSetDto {
  @ApiProperty({ example: 'Users', description: 'Name of the permission set' })
  @IsString()
  @IsNotEmpty()
  name: string;

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
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDefinitionDto)
  permissions: PermissionDefinitionDto[];
}
