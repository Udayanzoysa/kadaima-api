import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { Action, Subject } from '@prisma/client';

@ApiTags('Dashboard Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private abilityFactory: AbilityFactory,
  ) {}

  @Get('permissions')
  @ApiOperation({
    summary: 'Retrieves all CASL permissions for the logged in user',
  })
  @ApiResponse({ status: 200, description: 'All active permissions returned.' })
  async getPermissions(@Req() req: any) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        permissions: true,
        customRole: {
          include: {
            permissionSets: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!dbUser) return [];

    const ability = this.abilityFactory.createForUser(dbUser);

    if (dbUser.role === 'SUPER_ADMIN') {
      return [{ action: 'manage', subject: 'all' }];
    }

    const subjects = Object.values(Subject);
    const actions = [
      Action.CREATE,
      Action.READ,
      Action.EDIT,
      Action.DELETE,
      Action.EXPORT,
      Action.IMPORT,
      Action.ASSIGN,
      Action.CHANGE_STATUS,
    ];

    const allowed: { action: Action | string; subject: Subject | string }[] = [];
    for (const subject of subjects) {
      for (const action of actions) {
        if (ability.can(action as any, subject as any)) {
          allowed.push({ action, subject });
        }
      }
    }
    return allowed;
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Retrieves dynamic dashboard analytics metrics scoped by role',
  })
  @ApiResponse({ status: 200, description: 'Stats compiled and returned.' })
  async getStats(@Req() req: any) {
    const userRole = req.user.role;
    const workspaceId = req.user.workspaceId;

    if (userRole === 'SUPER_ADMIN') {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { subWorkspaces: true },
      });

      const workspaceIds = [
        workspaceId,
        ...(workspace?.subWorkspaces.map((w) => w.id) || []),
      ];

      const [totalWorkspacesCount, activeUsersCount] =
        await Promise.all([
          this.prisma.workspace.count({ where: { parentId: workspaceId } }),
          this.prisma.user.count({
            where: { workspaceId: { in: workspaceIds }, status: 'Active' },
          }),
        ]);

      return {
        userType: 'Admin',
        totalWorkspacesCount,
        activeUsersCount,
      };
    } else {
      return {
        userType: 'Customer',
      };
    }
  }

  @Get('menu')
  @ApiOperation({
    summary:
      'Retrieves sidebar navigation menu components filtered by user permissions',
  })
  @ApiResponse({ status: 200, description: 'Sidebar components returned.' })
  async getMenu(@Req() req: any) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        permissions: true,
        customRole: {
          include: {
            permissionSets: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!dbUser) return [];

    const ability = this.abilityFactory.createForUser(dbUser);

    const allMenuItems = [
      {
        name: 'Dashboard',
        path: '/dashboard',
        icon: 'LayoutDashboard',
        subject: Subject.DASHBOARD_ACCESS,
      },
      { name: 'Users', path: '/users', icon: 'Users', subject: Subject.USERS },
      { name: 'Roles', path: '/roles', icon: 'Shield', subject: Subject.ROLES },
      {
        name: 'Settings',
        path: '/settings',
        icon: 'Settings',
        subject: Subject.SETTINGS,
      },
      { name: 'Logs', path: '/logs', icon: 'Terminal', subject: Subject.LOG },
      {
        name: 'Reports',
        path: '/reports',
        icon: 'FileText',
        subject: Subject.REPORTS,
      },
      {
        name: 'Quizzes',
        path: '/quizzes',
        icon: 'ClipboardList',
        subject: Subject.QUIZZES,
      },
    ];

    return allMenuItems
      .filter(
        (item) =>
          ability.can(Action.READ, item.subject) ||
          ability.can(Action.MANAGE, item.subject),
      )
      .map(({ name, path, icon }) => ({ name, path, icon }));
  }
}
