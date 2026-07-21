import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import { RegisterDto } from './dto/register.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import {
  ForgotPasswordChannelDto,
  ForgotPasswordDto,
} from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { PasswordResetChannel, Role, Action, Subject } from '@prisma/client';
import { validateAndCleanSriLankanNumber } from '../common/phone-validator';
import {
  PASSWORD_CHANGED_EVENT,
  PasswordChangedEvent,
} from '../notification/events/password-changed.event';
import {
  PASSWORD_RESET_EVENT,
  PasswordResetEvent,
} from '../notification/events/password-reset.event';
import {
  USER_WELCOME_EVENT,
  UserWelcomeEvent,
  WelcomeAccountType,
} from '../notification/events/welcome.event';
import { assertValidSlug, slugFromName } from '../teachers/slug.util';
import { AuditAction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';

const DEFAULT_WORKSPACE_NAME = 'Techwing LMS';

/** IP / user-agent forwarded from the controller for auth event logging. */
export interface AuthRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  private logAuthEvent(
    action: AuditAction,
    user: { id: string; email: string; name?: string | null; role: string },
    meta?: AuthRequestMeta,
    description?: string,
  ) {
    void this.auditService.log({
      action,
      subject: 'AUTH',
      description,
      actor: { id: user.id, email: user.email, name: user.name, role: user.role },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  private logLoginFailed(email: string, meta?: AuthRequestMeta, reason?: string) {
    void this.auditService.log({
      action: AuditAction.LOGIN_FAILED,
      subject: 'AUTH',
      description: reason ? `Login failed: ${reason}` : 'Login failed',
      actor: { email },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  private emitWelcomeEmail(input: {
    userId: string;
    email: string;
    userName?: string | null;
    accountType: WelcomeAccountType;
  }) {
    this.eventEmitter.emit(
      USER_WELCOME_EVENT,
      new UserWelcomeEvent(
        input.userId,
        input.email,
        input.userName,
        input.accountType,
      ),
    );
  }

  /**
   * Teachers with a pending/rejected review cannot sign in until an admin
   * activates their profile (email/password and Google).
   * Super admins are never blocked by teacher review status.
   */
  private async assertTeacherLoginAllowed(user: {
    id: string;
    role: Role | string;
  }) {
    if (user.role === Role.SUPER_ADMIN) return;

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { reviewStatus: true },
    });
    if (!profile) return;

    if (profile.reviewStatus === 'Pending') {
      throw new UnauthorizedException(
        'Your teacher profile is pending admin review. You can sign in after an administrator activates your account.',
      );
    }
    if (profile.reviewStatus === 'Rejected') {
      throw new UnauthorizedException(
        'Your teacher profile was not approved. Please contact support for help.',
      );
    }
  }

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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, firstName: true, lastName: true },
    });
    if (user?.email) {
      const userName =
        user.name ||
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        null;
      this.eventEmitter.emit(
        PASSWORD_CHANGED_EVENT,
        new PasswordChangedEvent(userId, user.email, userName, 'reset'),
      );
    }

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
  async registerStudent(dto: RegisterAccountDto, meta?: AuthRequestMeta) {
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

    this.emitWelcomeEmail({
      userId: user.id,
      email: user.email,
      userName: user.name,
      accountType: 'student',
    });
    this.logAuthEvent(AuditAction.SIGNUP, user, meta, 'Student registered');

    return {
      userId: user.id,
      workspaceId: workspace.id,
      accountType: 'STUDENT' as const,
      status: 'REGISTERED',
    };
  }

  /** Teacher signup — joins default workspace with Quizzes + Questions access. */
  async registerTeacher(dto: RegisterAccountDto, meta?: AuthRequestMeta) {
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
        reviewStatus: 'Pending',
      },
    });

    this.emitWelcomeEmail({
      userId: user.id,
      email: user.email,
      userName: user.name,
      accountType: 'teacher',
    });
    this.logAuthEvent(AuditAction.SIGNUP, user, meta, 'Teacher registered');

    return {
      userId: user.id,
      workspaceId: workspace.id,
      accountType: 'TEACHER' as const,
      status: 'REGISTERED',
      publicPagePath: `/t/${slug}`,
    };
  }

  // 1. Unified Multi-Tenant Registration
  async register(dto: RegisterDto, meta?: AuthRequestMeta) {
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
        email: user.email,
        name: user.name,
      };
    }).then((result) => {
      this.emitWelcomeEmail({
        userId: result.userId,
        email: result.email,
        userName: result.name,
        accountType: 'admin',
      });
      this.logAuthEvent(
        AuditAction.SIGNUP,
        { id: result.userId, email: result.email, name: result.name, role: Role.CUSTOMER_ADMIN },
        meta,
        'Workspace admin registered',
      );
      return {
        userId: result.userId,
        workspaceId: result.workspaceId,
        status: result.status,
      };
    });
  }

  // 2. Primary Login & Step-Up Authentication Routing Matrix
  async login(dto: LoginDto, meta?: AuthRequestMeta) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { workspace: true },
    });

    if (!user) {
      this.logLoginFailed(email, meta, 'unknown email');
      throw new UnauthorizedException('Invalid login credentials.');
    }

    if (user.status === 'Inactive') {
      this.logLoginFailed(email, meta, 'account deactivated');
      throw new UnauthorizedException('Your account is deactivated. Please contact support.');
    }

    await this.assertTeacherLoginAllowed(user);

    if (!user.passwordHash) {
      this.logLoginFailed(email, meta, 'Google-only account');
      throw new UnauthorizedException(
        'This account uses Google sign-in. Continue with Google instead.',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logLoginFailed(email, meta, 'invalid password');
      throw new UnauthorizedException('Invalid login credentials.');
    }

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
    this.logAuthEvent(AuditAction.LOGIN, user, meta);
    return this.generateSessionTokens(user);
  }

  /**
   * Google Sign-In: verify GIS ID token, find or create user, return JWT
   * (same shape as email/password login).
   */
  async loginWithGoogle(dto: GoogleAuthDto, meta?: AuthRequestMeta) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new BadRequestException(
        'Google sign-in is not configured (GOOGLE_CLIENT_ID missing).',
      );
    }

    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload() || {};
    } catch {
      throw new UnauthorizedException('Invalid Google sign-in token.');
    }

    const googleId = payload.sub?.trim();
    const email = payload.email?.trim().toLowerCase();
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    if (!googleId || !email || !emailVerified) {
      throw new UnauthorizedException(
        'Google account email is missing or not verified.',
      );
    }

    const displayName =
      payload.name?.trim() ||
      [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim() ||
      email.split('@')[0];

    const accountType = dto.accountType === 'teacher' ? 'teacher' : 'student';

    let existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
    });

    let userId: string;

    if (existing) {
      if (existing.status === 'Inactive') {
        throw new UnauthorizedException(
          'Your account is deactivated. Please contact support.',
        );
      }
      if (!existing.googleId) {
        existing = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId,
            name: existing.name || displayName,
            firstName:
              existing.firstName || payload.given_name || displayName.split(' ')[0],
            lastName:
              existing.lastName ||
              payload.family_name ||
              displayName.split(' ').slice(1).join(' ') ||
              null,
          },
        });
      }
      // Teacher Google register: assign Teacher role even if the account already exists
      if (accountType === 'teacher') {
        await this.ensureTeacherAccessForGoogleUser({
          userId: existing.id,
          displayName: existing.name || displayName,
          email: existing.email,
        });
      }
      userId = existing.id;
    } else if (accountType === 'teacher') {
      const created = await this.registerTeacherFromGoogle({
        email,
        googleId,
        displayName,
        givenName: payload.given_name,
        familyName: payload.family_name,
      });
      userId = created.userId;
    } else {
      const created = await this.registerStudentFromGoogle({
        email,
        googleId,
        displayName,
        givenName: payload.given_name,
        familyName: payload.family_name,
      });
      userId = created.userId;
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { workspace: true },
    });

    await this.assertTeacherLoginAllowed(user);

    if (user.isTwoFactorEnabled) {
      return {
        requires2FA: true,
        preAuthToken: this.jwtService.sign(
          { sub: user.id, scope: '2fa_pending' },
          { expiresIn: '5m' },
        ),
      };
    }

    this.logAuthEvent(AuditAction.LOGIN, user, meta, 'Google sign-in');
    return this.generateSessionTokens(user);
  }

  private async registerStudentFromGoogle(input: {
    email: string;
    googleId: string;
    displayName: string;
    givenName?: string;
    familyName?: string;
  }) {
    const workspace = await this.getDefaultWorkspace();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        googleId: input.googleId,
        passwordHash: null,
        name: input.displayName,
        firstName: input.givenName || input.displayName.split(' ')[0],
        lastName:
          input.familyName ||
          input.displayName.split(' ').slice(1).join(' ') ||
          null,
        team: 'Student',
        role: Role.USER,
        workspaceId: workspace.id,
        status: 'Active',
        canViewOthers: false,
        canManagePermissions: false,
      },
    });
    this.emitWelcomeEmail({
      userId: user.id,
      email: user.email,
      userName: user.name,
      accountType: 'student',
    });
    return { userId: user.id };
  }

  /**
   * When signing in via Google from the teacher register page, ensure the user
   * has the Teacher custom role + TeacherProfile (without demoting Owners).
   */
  private async ensureTeacherAccessForGoogleUser(input: {
    userId: string;
    displayName: string;
    email: string;
  }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      include: { workspace: true, customRole: true, teacherProfile: true },
    });

    if (
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.CUSTOMER_ADMIN ||
      user.customRole?.name === 'Owner'
    ) {
      return user;
    }

    const teacherRole = await this.ensureTeacherRole(user.workspaceId);
    const needsRole =
      user.customRoleId !== teacherRole.id || user.team !== 'Teacher';

    let updated = user;
    if (needsRole) {
      updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          team: 'Teacher',
          customRoleId: teacherRole.id,
        },
        include: { workspace: true, customRole: true, teacherProfile: true },
      });
    }

    if (!updated.teacherProfile) {
      await this.createTeacherProfileForUser({
        userId: updated.id,
        displayName: input.displayName,
        email: input.email,
      });
      updated = await this.prisma.user.findUniqueOrThrow({
        where: { id: updated.id },
        include: { workspace: true, customRole: true, teacherProfile: true },
      });
    }

    return updated;
  }

  private async createTeacherProfileForUser(input: {
    userId: string;
    displayName: string;
    email: string;
  }) {
    let slug = slugFromName(input.displayName, input.email);
    try {
      slug = assertValidSlug(slug);
    } catch {
      slug = `teacher-${input.userId.slice(0, 8)}`;
    }
    const taken = await this.prisma.teacherProfile.findUnique({ where: { slug } });
    if (taken) slug = `${slug}-${input.userId.slice(0, 6)}`;

    await this.prisma.teacherProfile.create({
      data: {
        userId: input.userId,
        slug,
        displayName: input.displayName,
        title: `${input.displayName}'s classes`,
        description: 'Welcome to my learning page. Explore my quizzes below.',
        isPublic: false,
        reviewStatus: 'Pending',
      },
    });
  }

  private async registerTeacherFromGoogle(input: {
    email: string;
    googleId: string;
    displayName: string;
    givenName?: string;
    familyName?: string;
  }) {
    const workspace = await this.getDefaultWorkspace();
    const teacherRole = await this.ensureTeacherRole(workspace.id);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        googleId: input.googleId,
        passwordHash: null,
        name: input.displayName,
        firstName: input.givenName || input.displayName.split(' ')[0],
        lastName:
          input.familyName ||
          input.displayName.split(' ').slice(1).join(' ') ||
          null,
        team: 'Teacher',
        role: Role.USER,
        workspaceId: workspace.id,
        customRoleId: teacherRole.id,
        status: 'Active',
        canViewOthers: false,
        canManagePermissions: false,
      },
    });

    await this.createTeacherProfileForUser({
      userId: user.id,
      displayName: input.displayName,
      email: input.email,
    });

    this.emitWelcomeEmail({
      userId: user.id,
      email: user.email,
      userName: user.name,
      accountType: 'teacher',
    });

    return { userId: user.id };
  }

  // 3. Second-Factor Verification Resolver
  async verifyTwoFactor(userId: string, token: string, meta?: AuthRequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret)
      throw new BadRequestException('MFA profile uninitialized.');

    if (user.status === 'Inactive') {
      throw new UnauthorizedException(
        'Your account is deactivated. Please contact support.',
      );
    }

    await this.assertTeacherLoginAllowed(user);

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });
    if (!isValid) {
      this.logLoginFailed(user.email, meta, 'invalid 2FA token');
      throw new UnauthorizedException('Invalid authorization token profile.');
    }

    this.logAuthEvent(AuditAction.LOGIN, user, meta, '2FA verified');
    return this.generateSessionTokens(user);
  }

  // Helper mapping execution context to state
  private generateSessionTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      team: user.team,
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

  /** Self-service profile update — name / phone / school only. */
  async updateProfile(
    userId: string,
    dto: { name?: string; phoneNumber?: string; school?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'Inactive') {
      throw new UnauthorizedException('Valid authorization session required.');
    }

    const trimmedName = dto.name?.trim();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: trimmedName || undefined,
        firstName: trimmedName ? trimmedName.split(' ')[0] : undefined,
        lastName: trimmedName
          ? trimmedName.split(' ').slice(1).join(' ') || null
          : undefined,
        phoneNumber:
          dto.phoneNumber === undefined
            ? undefined
            : dto.phoneNumber.trim() || null,
        company:
          dto.school === undefined ? undefined : dto.school.trim() || null,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      name:
        updated.name ||
        [updated.firstName, updated.lastName].filter(Boolean).join(' ') ||
        updated.email,
      phoneNumber: updated.phoneNumber,
      school: updated.company,
      team: updated.team,
      role: updated.role,
    };
  }

  /** Self-service password change (requires current password on file). */
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'Inactive') {
      throw new UnauthorizedException('Valid authorization session required.');
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account signed in with Google and has no password set yet. Use "Forgot password" to set one.',
      );
    }

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    const userName =
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      null;
    this.eventEmitter.emit(
      PASSWORD_CHANGED_EVENT,
      new PasswordChangedEvent(userId, user.email, userName, 'changed'),
    );

    return { ok: true };
  }
}
