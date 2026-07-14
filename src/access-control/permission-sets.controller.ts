import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { CreatePermissionSetDto } from './dto/create-permission-set.dto';
import { UpdatePermissionSetDto } from './dto/update-permission-set.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Permission Sets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permission-sets')
export class PermissionSetsController {
  constructor(private accessControlService: AccessControlService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieves all permission sets in the workspace' })
  @ApiResponse({
    status: 200,
    description: 'List of permission sets returned.',
  })
  async getPermissionSets(@Req() req: any) {
    return this.accessControlService.getPermissionSets(req.user.workspaceId);
  }

  @Post()
  @ApiOperation({
    summary: 'Creates a custom permission set with nested action rules',
  })
  @ApiResponse({
    status: 201,
    description: 'Permission set successfully generated.',
  })
  async createPermissionSet(
    @Req() req: any,
    @Body() dto: CreatePermissionSetDto,
  ) {
    return this.accessControlService.createPermissionSet(
      req.user.workspaceId,
      dto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific permission set' })
  async getPermissionSetById(@Req() req: any, @Param('id') id: string) {
    return this.accessControlService.getPermissionSetById(
      req.user.workspaceId,
      id,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Updates a custom permission set and updates nested permissions',
  })
  async updatePermissionSet(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionSetDto,
  ) {
    return this.accessControlService.updatePermissionSet(
      req.user.workspaceId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletes a permission set from the workspace' })
  async deletePermissionSet(@Req() req: any, @Param('id') id: string) {
    return this.accessControlService.deletePermissionSet(
      req.user.workspaceId,
      id,
    );
  }
}
