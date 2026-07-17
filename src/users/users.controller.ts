import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Subject } from '@prisma/client';

@ApiTags('User Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @CheckPolicies({ action: Action.READ, subject: Subject.USERS })
  @ApiOperation({
    summary: 'Retrieves all users in the workspace with filtering',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filter by workspace custom role name',
  })
  @ApiQuery({
    name: 'team',
    required: false,
    description: 'Filter by team name',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['All', 'Active', 'Inactive', 'Suspended'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for name or email',
  })
  @ApiResponse({ status: 200, description: 'Returns matching users list.' })
  async getUsers(
    @Req() req: any,
    @Query('role') role?: string,
    @Query('team') team?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.getUsers(
      req.user.workspaceId,
      { role, team, status, search },
      req.user.id,
    );
  }

  @Post()
  @CheckPolicies({ action: Action.CREATE, subject: Subject.USERS })
  @ApiOperation({ summary: 'Onboards a new member into the tenant workspace' })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  async createUser(@Req() req: any, @Body() dto: any) {
    return this.usersService.createUser(req.user.workspaceId, dto, req.user.id);
  }

  @Get(':id')
  @CheckPolicies({ action: Action.READ, subject: Subject.USERS })
  @ApiOperation({ summary: 'Fetches details of a workspace member' })
  async getUserById(@Req() req: any, @Param('id') id: string) {
    return this.usersService.getUserById(req.user.workspaceId, id, req.user.id);
  }

  @Patch(':id')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({ summary: 'Updates workspace user configurations' })
  async updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(req.user.workspaceId, id, dto, req.user.id);
  }

  @Post(':id/soft-delete')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({
    summary: 'Soft-delete a user (deactivate — status set to Inactive)',
  })
  @ApiResponse({ status: 200, description: 'User deactivated.' })
  async softDeleteUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.softDeleteUser(
      req.user.workspaceId,
      id,
      req.user.id,
    );
  }

  @Post(':id/deactivate')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({
    summary: 'Deactivates a workspace user (alias of soft-delete)',
  })
  async deactivateUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.deactivateUser(
      req.user.workspaceId,
      id,
      req.user.id,
    );
  }

  @Delete(':id')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({
    summary:
      'Hard-delete a user permanently. Quizzes they created are reassigned to you.',
  })
  @ApiResponse({ status: 200, description: 'User permanently deleted.' })
  async hardDeleteUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.hardDeleteUser(
      req.user.workspaceId,
      id,
      req.user.id,
    );
  }

  @Post(':id/activate-teacher')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({
    summary:
      'Activate a pending teacher profile after review (sends confirmation email)',
  })
  @ApiResponse({ status: 200, description: 'Teacher profile activated.' })
  async activateTeacherProfile(@Req() req: any, @Param('id') id: string) {
    return this.usersService.activateTeacherProfile(
      req.user.workspaceId,
      id,
      req.user.id,
    );
  }

  @Post(':id/invite')
  @CheckPolicies({ action: Action.EDIT, subject: Subject.USERS })
  @ApiOperation({ summary: 'Resends onboarding invite email' })
  async inviteUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.inviteUser(req.user.workspaceId, id, req.user.id);
  }
}
