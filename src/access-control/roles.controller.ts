import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private accessControlService: AccessControlService) {}

  @Get()
  @ApiOperation({
    summary: 'Retrieves all roles available in the user workspace',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['All', 'System', 'Custom'],
    description: 'Filter by role type',
  })
  @ApiQuery({
    name: 'owner',
    required: false,
    description: 'Filter by role owner',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['All', 'Active', 'Needs review'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for role name',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles matching criteria successfully returned.',
  })
  async getRoles(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('owner') owner?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const q: any = {};
    if (type && type !== 'All') q.type = type;
    if (owner && owner !== 'All') q.owner = owner;
    if (status && status !== 'All') q.status = status;
    if (search) q.search = search;

    return this.accessControlService.getRoles(req.user.workspaceId, q);
  }

  @Post()
  @ApiOperation({
    summary: 'Creates a custom role definition in the workspace',
  })
  @ApiResponse({ status: 201, description: 'Role created successfully.' })
  async createRole(@Req() req: any, @Body() dto: CreateRoleDto) {
    return this.accessControlService.createRole(req.user.workspaceId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific role' })
  async getRoleById(@Req() req: any, @Param('id') id: string) {
    return this.accessControlService.getRoleById(req.user.workspaceId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Updates a custom role definition' })
  async updateRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.accessControlService.updateRole(req.user.workspaceId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletes a custom role from the workspace' })
  async deleteRole(@Req() req: any, @Param('id') id: string) {
    return this.accessControlService.deleteRole(req.user.workspaceId, id);
  }

  @Post(':id/review')
  @ApiOperation({
    summary: 'Performs access review, marking a role as active/reviewed',
  })
  async reviewRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body('notes') notes?: string,
  ) {
    return this.accessControlService.reviewRole(
      req.user.workspaceId,
      id,
      req.user.id,
      notes,
    );
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assigns users in the workspace to a role' })
  async assignRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.accessControlService.assignRoleToUsers(
      req.user.workspaceId,
      id,
      dto,
    );
  }
}
