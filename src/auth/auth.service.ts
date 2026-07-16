import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import { RegisterDto } from './dto/register.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginDto } from './dto/login.dto';
import {
  ForgotPasswordChannelDto,
  ForgotPasswordDto,
} from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { PasswordResetChannel, Role, Action, Subject } from '@prisma/client';
import { validateAndCleanSriLankanNumber } from '../common/phone-validator';
import {
  PASSWORD_RESET_EVENT,
  PasswordResetEvent,
} from '../notification/events/password-reset.event';
import { assertValidSlug, slugFromName } from '../teachers/slug.util';

const DEFAULT_WORKSPACE_NAME = 'Techwing LMS';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private config: ConfigService,
  ) {}

  private hashResetToken(plain: string) {
    return createHash('sha256').update(plain).digest('hex');
  }

  private generateOtp(): string {
    return String(randomInt(100000, 1000000));
  }

  /**
   * Request a password reset via EMAIL or SMS.
   * Returns a clear error when no matching active account exists.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    if (dto.channel === ForgotPasswordChannelDto.EMAIL) {
      await this.requestEmailReset(dto.email!);
      return {
        message:
          'A password reset link has been sent to your email. Click “Reset My Password” in the message.',
        channel: 'EMAIL' as const,
        destination: dto.email!.trim().toLowerCase(),
      };
    }

    const destination = await this.requestSmsReset(dto.phoneNumber!);
    return {
      message: 'A password reset code has been sent to your mobile number.',
      channel: 'SMS' as const,
      destination,
    };
  }

  private async requestEmailReset(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
      },
    });
    if (!user || user.status === 'Inactive') {
      throw new BadRequestException('No user found for that email.');
    }

    await this.issueResetToken(
      user.id,
      PasswordResetChannel.EMAIL,
      user.email,
      user.name || user.firstName || null,
    );
  }

  private async requestSmsReset(phoneNumber: string) {
    const normalized = validateAndCleanSriLankanNumber(phoneNumber);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: normalized },
          { phoneNumber: `+${normalized}` },
          { phoneNumber: `0${normalized.slice(2)}` },
        ],
        status: 'Active',
      },
    });
    if (!user?.phoneNumber) {
      throw new BadRequestException('No user found for that mobile number.');
    }

    await this.issueResetToken(
      user.id,
      PasswordResetChannel.SMS,
      normalized,
      user.name || user.firstName || null,
    );
    return normalized;
  }

  private async issueResetToken(
    userId: string,
    channel: PasswordResetChannel,
    destination: string,
    userName?: string | null,
  ) {
    const plainToken = this.generateOtp();
    const tokenHash = this.hashResetToken(plainToken);
    const ttlSeconds = this.config.get<number>('RESET_TOKEN_TTL') ?? 600;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Invalidate prior unused tokens for this user+channel
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, channel, isUsed: false },
      data: { isUsed: true },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        token: tokenHash,
        userId,
        channel,
        destination,
        expiresAt,
      },
    });

    this.eventEmitter.emit(
      PASSWORD_RESET_EVENT,
      new PasswordResetEvent(
        userId,
        channel,
        destination,
        plainToken,
        expiresAt,
        userName,
      ),
    );
  }

  /** Validate a reset token without consuming it (used by magic-link page). */
  async validateResetToken(dto: ValidateResetTokenDto) {
    await this.findValidResetRecord(dto);
    return { valid: true, message: 'Reset link is valid. Choose a new password.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { userId, record } = await this.findValidResetRecord(dto);
    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { isUsed: true },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, isUsed: false },
        data: { isUsed: true },
      });
    });

    return { message: 'Password updated successfully. You can sign in now.' };
  }

  private async findValidResetRecord(dto: ValidateResetTokenDto | ResetPasswordDto) {
    const tokenHash = this.hashResetToken(dto.token.trim());
    let userId: string | null = null;

    if (dto.channel === ForgotPasswordChannelDto.EMAIL) {
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: dto.email!.trim(), mode: 'insensitive' },
        },
        select: { id: true, status: true },
      });
      if (!user || user.status === 'Inactive') {
        throw new BadRequestException('Invalid or expired reset link.');
      }
      userId = user.id;
    } else {
      const normalized = validateAndCleanSriLankanNumber(dto.phoneNumber!);
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phoneNumber: normalized },
            { phoneNumber: `+${normalized}` },
            { phoneNumber: `0${normalized.slice(2)}` },
          ],
          status: 'Active',
        },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('Invalid or expired reset code.');
      }
      userId = user.id;
    }

    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId,
        token: tokenHash,
        channel: dto.channel as PasswordResetChannel,
        isUsed: false,
      },
    });

    if (!record || record.expiresAt <= new Date()) {
      throw new BadRequestException(
        dto.channel === ForgotPasswordChannelDto.EMAIL
          ? 'Invalid or expired reset link.'
          : 'Invalid or expired reset code.',
      );
    }

    return { userId, record };
  }

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

    // Draft public page — teacher publishes later from settings
    let slug = slugFromName(displayName, dto.email);
    try {
      slug = assertValidSlug(slug);
    } catch {
      slug = `teacher-${user.id.slice(0, 8)}`;
    }
    const taken = await this.prisma.teacherProfile.findUnique({ where: { slug } });
    if (taken) slug = `${slug}-${user.id.slice(0, 6)}`;

    await this.prisma.teacherProfile.create({
      data: {
        userId: user.id,
        slug,
        displayName,
        title: `${displayName}'s classes`,
        description: 'Welcome to my learning page. Explore my quizzes below.',
        isPublic: false,
      },
    });

    return {
      userId: user.id,
      workspaceId: workspace.id,
      accountType: 'TEACHER' as const,
      status: 'REGISTERED',
      publicPagePath: `/t/${slug}`,
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
