import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateAccessReviewDto {
  @ApiProperty({
    example: 'uuid-role-1',
    description: 'ID of the role being reviewed',
  })
  @IsString()
  @IsNotEmpty()
  roleId: string;

  @ApiProperty({
    example: 'Approved',
    description: 'Decision status of the access review',
    enum: ['Approved', 'Revoked', 'Modified'],
  })
  @IsString()
  @IsIn(['Approved', 'Revoked', 'Modified'])
  status: string;

  @ApiProperty({
    example: 'User access levels verified and aligned with company guidelines.',
    description: 'Review notes or justification',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
