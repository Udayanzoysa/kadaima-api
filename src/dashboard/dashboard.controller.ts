import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { Action, Subject } from '@prisma/client';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private abilityFactory: AbilityFactory,
    private dashboardService: DashboardService,
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
    summary: 'Retrieves dashboard KPI counts scoped by role',
  })
  @ApiResponse({ status: 200, description: 'Stats compiled and returned.' })
  async getStats(@Req() req: any) {
    return this.dashboardService.getStats(req.user);
  }

  @Get('overview')
  @ApiOperation({
    summary:
      'Full overview: metrics, 6-month trend, paginated payments / teachers / quizzes',
  })
  @ApiQuery({ name: 'paymentsPage', required: false })
  @ApiQuery({ name: 'paymentsPageSize', required: false })
  @ApiQuery({ name: 'teachersPage', required: false })
  @ApiQuery({ name: 'teachersPageSize', required: false })
  @ApiQuery({ name: 'quizzesPage', required: false })
  @ApiQuery({ name: 'quizzesPageSize', required: false })
  async getOverview(
    @Req() req: any,
    @Query('paymentsPage') paymentsPage?: string,
    @Query('paymentsPageSize') paymentsPageSize?: string,
    @Query('teachersPage') teachersPage?: string,
    @Query('teachersPageSize') teachersPageSize?: string,
    @Query('quizzesPage') quizzesPage?: string,
    @Query('quizzesPageSize') quizzesPageSize?: string,
  ) {
    return this.dashboardService.getOverview(req.user, {
      paymentsPage: paymentsPage ? Number(paymentsPage) : undefined,
      paymentsPageSize: paymentsPageSize ? Number(paymentsPageSize) : undefined,
      teachersPage: teachersPage ? Number(teachersPage) : undefined,
      teachersPageSize: teachersPageSize ? Number(teachersPageSize) : undefined,
      quizzesPage: quizzesPage ? Number(quizzesPage) : undefined,
      quizzesPageSize: quizzesPageSize ? Number(quizzesPageSize) : undefined,
    });
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
