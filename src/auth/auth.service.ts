import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { RegisterDto } from './dto/register.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginDto } from './dto/login.dto';
import { Role, Action, Subject } from '@prisma/client';

const DEFAULT_WORKSPACE_NAME = 'Techwing LMS';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  private async assertEmailAvailable(email: string) {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered globally.');
    }
  }

  private async getDefaultWorkspace() {
    const workspace = await this.prisma.workspace.findFirst({
      where: { name: DEFAULT_WORKSPACE_NAME },
      orderBy: { createdAt: 'asc' },
    });
    if (!workspace) {
      throw new BadRequestException(
        'Default workspace is not ready. Ask a super admin to seed the platform first.',
      );
    }
    return workspace;
  }

  private async ensureTeacherRole(workspaceId: string) {
    const existing = await this.prisma.customRole.findFirst({
      where: { workspaceId, name: 'Teacher' },
    });
    if (existing) return existing;

    const quizzesSet = await this.prisma.permissionSet.findFirst({
      where: { workspaceId, name: 'Quizzes' },
    });
    const dashboardSet = await this.prisma.permissionSet.findFirst({
      where: { workspaceId, name: 'Dashboard Access' },
    });

    if (!quizzesSet) {
      throw new BadRequestException('Quizzes permission set is missing for this workspace.');
    }

    return this.prisma.customRole.create({
      data: {
        name: 'Teacher',
        accessLevel: 'Limited',
        description: 'Manage quizzes and question bank only',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: [
            { id: quizzesSet.id },
            ...(dashboardSet ? [{ id: dashboardSet.id }] : []),
          ],
        },
      },
    });
  }

  /** Student signup — joins default workspace with no admin permissions. */
  async registerStudent(dto: RegisterAccountDto) {
    await this.assertEmailAvailable(dto.email);
    const workspace = await this.getDefaultWorkspace();
    const passwordHash = await this.hashPassword(dto.password);
    const displayName = dto.name?.trim() || dto.email.split('@')[0];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: displayName,
        firstName: displayName.split(' ')[0],
        lastName: displayName.split(' ').slice(1).join(' ') || null,
        team: 'Student',
        role: Role.USER,
        workspaceId: workspace.id,
        status: 'Active',
        canViewOthers: false,
        canManagePermissions: false,
      },
    });

    return {
      userId: user.id,
      workspaceId: workspace.id,
      accountType: 'STUDENT' as const,
      status: 'REGISTERED',
    };
  }

  /** Teacher signup — joins default workspace with Quizzes + Questions access. */
  async registerTeacher(dto: RegisterAccountDto) {
    await this.assertEmailAvailable(dto.email);
    const workspace = await this.getDefaultWorkspace();
    const teacherRole = await this.ensureTeacherRole(workspace.id);
    const passwordHash = await this.hashPassword(dto.password);
    const displayName = dto.name?.trim() || dto.email.split('@')[0];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: displayName,
        firstName: displayName.split(' ')[0],
        lastName: displayName.split(' ').slice(1).join(' ') || null,
        team: 'Teacher',
        role: Role.USER,
        workspaceId: workspace.id,
        customRoleId: teacherRole.id,
        status: 'Active',
        canViewOthers: false,
        canManagePermissions: false,
      },
    });

    return {
      userId: user.id,
      workspaceId: workspace.id,
      accountType: 'TEACHER' as const,
      status: 'REGISTERED',
    };
  }

  // 1. Unified Multi-Tenant Registration
  async register(dto: RegisterDto) {
    await this.assertEmailAvailable(dto.email);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    // Atomic Prisma Transaction: Ensure both workspace and user are created cleanly together
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: dto.workspaceName,
          parentId: dto.parentId || null,
        },
      });

      // 1. Seed Permission Sets with standard subjects matching the UI
      const pSetsData = [
        {
          name: 'Settings',
          description: 'Allows editing workspace settings',
          permissions: [{ action: Action.MANAGE, subject: Subject.SETTINGS }],
        },
        {
          name: 'Users',
          description: 'Allows full management of workspace users',
          permissions: [{ action: Action.MANAGE, subject: Subject.USERS }],
        },
        {
          name: 'Roles',
          description: 'Allows defining roles and scope configurations',
          permissions: [{ action: Action.MANAGE, subject: Subject.ROLES }],
        },
        {
          name: 'Dashboard Access',
          description: 'Allows accessing general dashboards',
          permissions: [
            { action: Action.MANAGE, subject: Subject.DASHBOARD_ACCESS },
          ],
        },
        {
          name: 'Log',
          description: 'Allows reading action logs',
          permissions: [{ action: Action.MANAGE, subject: Subject.LOG }],
        },
        {
          name: 'Reports',
          description: 'Allows exporting system reports',
          permissions: [{ action: Action.MANAGE, subject: Subject.REPORTS }],
        },
        {
          name: 'Quizzes',
          description: 'Allows managing quizzes and assessments',
          permissions: [{ action: Action.MANAGE, subject: Subject.QUIZZES }],
        },
      ];

      const seededPermissionSets: { id: string; name: string }[] = [];
      for (const ps of pSetsData) {
        const createdPs = await (tx as any).permissionSet.create({
          data: {
            name: ps.name,
            description: ps.description,
            workspaceId: workspace.id,
            permissions: {
              create: ps.permissions.map((perm) => ({
                action: perm.action,
                subject: perm.subject,
              })),
            },
          },
        });
        seededPermissionSets.push({ id: createdPs.id, name: createdPs.name });
      }

      const getPSetIds = (names: string[]) => {
        return seededPermissionSets
          .filter((ps) => names.includes(ps.name))
          .map((ps) => ({ id: ps.id }));
      };

      // 2. Seed Default Roles matching the UI
      const ownerRole = await (tx as any).customRole.create({
        data: {
          name: 'Owner',
          accessLevel: 'Full',
          description: 'Full workspace ownership and control',
          workspaceId: workspace.id,
          status: 'Needs review',
          owner: 'System',
          isSystem: false,
          permissionSets: {
            connect: getPSetIds([
              'Settings',
              'Users',
              'Roles',
              'Dashboard Access',
              'Log',
              'Reports',
              'Quizzes',
            ]),
          },
        },
      });

      await (tx as any).customRole.create({
        data: {
          name: 'Admin',
          accessLevel: 'Full',
          description: 'Administrator access with full privileges',
          workspaceId: workspace.id,
          status: 'Needs review',
          owner: 'Jane Doe',
          isSystem: false,
          permissionSets: {
            connect: getPSetIds([
              'Settings',
              'Users',
              'Roles',
              'Dashboard Access',
              'Log',
              'Reports',
              'Quizzes',
            ]),
          },
        },
      });

      await (tx as any).customRole.create({
        data: {
          name: 'Teacher',
          accessLevel: 'Limited',
          description: 'Manage quizzes and question bank only',
          workspaceId: workspace.id,
          status: 'Active',
          owner: 'System',
          isSystem: true,
          permissionSets: {
            connect: getPSetIds(['Quizzes', 'Dashboard Access']),
          },
        },
      });

      // 3. Create registering User, linking to Owner role
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.email.split('@')[0],
          team: 'Executive',
          role: Role.CUSTOMER_ADMIN,
          workspaceId: workspace.id,
          customRoleId: ownerRole.id,
          status: 'Active',
        },
      });

      return {
        userId: user.id,
        workspaceId: workspace.id,
        status: 'ONBOARDED',
      };
    });
  }

  // 2. Primary Login & Step-Up Authentication Routing Matrix
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { workspace: true },
    });

    if (!user) throw new UnauthorizedException('Invalid login credentials.');

    if (user.status === 'Inactive') {
      throw new UnauthorizedException('Your account is deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid login credentials.');

    // If 2FA is active, yield a temporary pre-auth token valid for 5 minutes max
    if (user.isTwoFactorEnabled) {
      return {
        requires2FA: true,
        preAuthToken: this.jwtService.sign(
          { sub: user.id, scope: '2fa_pending' },
          { expiresIn: '5m' },
        ),
      };
    }

    // 2FA disabled: generate absolute session keys directly
    return this.generateSessionTokens(user);
  }

  // 3. Second-Factor Verification Resolver
  async verifyTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret)
      throw new BadRequestException('MFA profile uninitialized.');

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });
    if (!isValid)
      throw new UnauthorizedException('Invalid authorization token profile.');

    return this.generateSessionTokens(user);
  }

  // Helper mapping execution context to state
  private generateSessionTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
    };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '1d' }),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        company: true,
        team: true,
        role: true,
        status: true,
      },
    });
    if (!user || user.status === 'Inactive') {
      throw new UnauthorizedException('Valid authorization session required.');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      phoneNumber: user.phoneNumber,
      school: user.company,
      team: user.team,
      role: user.role,
    };
  }
}
