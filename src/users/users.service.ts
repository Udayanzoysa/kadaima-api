import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  PASSWORD_CHANGED_EVENT,
  PasswordChangedEvent,
} from '../notification/events/password-changed.event';
import {
  TEACHER_ACTIVATED_EVENT,
  TeacherActivatedEvent,
} from '../notification/events/teacher-activated.event';
import {
  USER_INVITE_EVENT,
  UserInviteEvent,
} from '../notification/events/user-invite.event';
import {
  USER_WELCOME_EVENT,
  UserWelcomeEvent,
} from '../notification/events/welcome.event';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { validateAndCleanSriLankanNumber } from '../common/phone-validator';
import {
  isPlatformOwner,
  isRootPlatformOwner,
} from '../common/platform-owner';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  private getDescendantIds(users: any[], parentId: string): string[] {
    const result: string[] = [];
    const queue = [parentId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = users.filter((u) => u.invitedById === currentId);
      for (const child of children) {
        if (!result.includes(child.id)) {
          result.push(child.id);
          queue.push(child.id);
        }
      }
    }
    return result;
  }

  async getUsers(
    workspaceId: string,
    query: { role?: string; team?: string; status?: string; search?: string },
    callingUserId: string,
  ) {
    const callingUser = await this.prisma.user.findUnique({
      where: { id: callingUserId },
    });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    const where: any = {};

    // Apply visibility scoping hierarchy & workspace isolation
    if (!isPlatformOwner(callingUser)) {
      where.workspaceId = workspaceId;
      if (callingUser.canViewOthers) {
        const allUsers = await this.prisma.user.findMany({
          where: { workspaceId },
        });
        const descendantIds = this.getDescendantIds(allUsers, callingUserId);
        where.id = { in: [callingUserId, ...descendantIds] };
      } else {
        where.id = callingUserId;
      }
    }

    if (query.team && query.team !== 'All') {
      where.team = query.team;
    }

    if (query.status && query.status !== 'All') {
      where.status = query.status;
    }

    if (query.role && query.role !== 'All') {
      where.customRole = { name: query.role };
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        team: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        canViewOthers: true,
        canManagePermissions: true,
        customRoleId: true,
        workspaceId: true,
        googleId: true,
        passwordHash: true,
        customRole: {
          select: {
            id: true,
            name: true,
            accessLevel: true,
          },
        },
        workspace: {
          select: {
            name: true,
          },
        },
        teacherProfile: {
          select: {
            id: true,
            slug: true,
            reviewStatus: true,
            isPublic: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map(({ googleId, passwordHash, ...rest }) => ({
      ...rest,
      authProvider: googleId ? ('google' as const) : ('email' as const),
      hasPassword: !!passwordHash,
    }));
  }

  async getUserById(workspaceId: string, id: string, callingUserId?: string) {
    let caller: { email: string; role: string } | null = null;
    if (callingUserId) {
      caller = await this.prisma.user.findUnique({
        where: { id: callingUserId },
        select: { email: true, role: true },
      });
    }

    const where: any = { id };
    if (!caller || !isPlatformOwner(caller)) {
      where.workspaceId = workspaceId;
    }

    let user = await this.prisma.user.findFirst({
      where,
      include: {
        customRole: true,
        workspace: true,
      },
    });
    if (!user) throw new NotFoundException('User not found or access denied.');

    return user;
  }

  async createUser(workspaceId: string, dto: CreateUserDto, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({
      where: { id: callingUserId },
    });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Level 0 or delegated managers only
    if (!isPlatformOwner(callingUser) && !callingUser.canManagePermissions) {
      throw new ForbiddenException('You do not have permission to add users.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email is already registered.');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(
      dto.password || 'TempPassword123!',
      salt,
    );

    // Only Level 0 can configure view/manage delegation settings
    const canViewOthers = isPlatformOwner(callingUser) ? !!dto.canViewOthers : false;
    const canManagePermissions = isPlatformOwner(callingUser)
      ? !!dto.canManagePermissions
      : false;

    const user = await this.prisma.user.create({
      data: {
        workspaceId,
        email: dto.email,
        passwordHash,
        name: dto.name,
        team: dto.team,
        customRoleId: dto.customRoleId,
        status: dto.status || 'Active',
        invitedById: callingUserId,
        canViewOthers,
        canManagePermissions,
      },
      include: {
        customRole: true,
      },
    });

    this.eventEmitter.emit(
      USER_WELCOME_EVENT,
      new UserWelcomeEvent(user.id, user.email, user.name, 'member'),
    );

    return user;
  }

  async updateUser(workspaceId: string, id: string, dto: UpdateUserDto, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({
      where: { id: callingUserId },
    });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Fetch target user with platform-owner workspace bypass
    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException();

    const targetIsRoot = isRootPlatformOwner(targetUser);
    const callerIsRoot = isRootPlatformOwner(callingUser);

    // Root account: only the root may update themselves, and only safe profile fields
    if (targetIsRoot) {
      if (!callerIsRoot || id !== callingUserId) {
        throw new ForbiddenException(
          'The root platform owner account cannot be edited.',
        );
      }
      if (
        dto.role !== undefined ||
        dto.status !== undefined ||
        dto.canViewOthers !== undefined ||
        dto.canManagePermissions !== undefined ||
        dto.customRoleId !== undefined ||
        dto.team !== undefined
      ) {
        throw new ForbiddenException(
          'Root platform owner privilege fields cannot be changed.',
        );
      }
    }

    // Hierarchical update verification
    if (!isPlatformOwner(callingUser)) {
      if (id !== callingUserId) {
        const allUsers = await this.prisma.user.findMany({ where: { workspaceId } });
        const descendantIds = this.getDescendantIds(allUsers, callingUserId);
        if (!descendantIds.includes(id)) {
          throw new ForbiddenException('You can only update users under your branch.');
        }
      }
      if (!callingUser.canManagePermissions) {
        throw new ForbiddenException('You do not have permission to update users.');
      }
    }

    let twoFactorSecret = targetUser.twoFactorSecret;
    if (dto.isTwoFactorEnabled && !twoFactorSecret) {
      twoFactorSecret = authenticator.generateSecret();
    }

    let updatedName = dto.name;
    if (
      !updatedName &&
      (dto.firstName !== undefined || dto.lastName !== undefined)
    ) {
      const currentFirstName =
        dto.firstName !== undefined ? dto.firstName : targetUser.firstName;
      const currentLastName =
        dto.lastName !== undefined ? dto.lastName : targetUser.lastName;
      updatedName =
        `${currentFirstName || ''} ${currentLastName || ''}`.trim() ||
        undefined;
    }

    let cleanedPhoneNumber = dto.phoneNumber;
    if (dto.phoneNumber !== undefined && dto.phoneNumber !== null && dto.phoneNumber !== '') {
      cleanedPhoneNumber = validateAndCleanSriLankanNumber(dto.phoneNumber);
    }

    const updateData: any = {
      name: updatedName !== undefined ? updatedName : dto.name,
      firstName: dto.firstName,
      lastName: dto.lastName,
      company: dto.company,
      phoneNumber: cleanedPhoneNumber,
      address: dto.address,
      isTwoFactorEnabled: dto.isTwoFactorEnabled,
      twoFactorSecret: twoFactorSecret,
      team: dto.team,
      customRoleId: dto.customRoleId,
      status: dto.status,
    };

    // System role: root platform owner only; never change root's own role
    if (dto.role !== undefined) {
      if (!callerIsRoot) {
        throw new ForbiddenException(
          'Only the root platform owner can grant or revoke Super Admin.',
        );
      }
      if (targetIsRoot) {
        throw new ForbiddenException(
          'The root platform owner system role cannot be changed.',
        );
      }
      updateData.role = dto.role as Role;
      if (dto.role === 'SUPER_ADMIN') {
        updateData.canViewOthers = true;
        updateData.canManagePermissions = true;
        if (dto.team === undefined) {
          updateData.team = 'Executive';
        }
        if (dto.customRoleId === undefined) {
          const ownerRole = await this.prisma.customRole.findFirst({
            where: {
              workspaceId: targetUser.workspaceId,
              name: 'Owner',
            },
            select: { id: true },
          });
          if (ownerRole) {
            updateData.customRoleId = ownerRole.id;
          }
        }
      }
    }

    // Workspace Name update
    if (dto.workspaceName) {
      const isOwner = callingUser.role === 'SUPER_ADMIN' || targetUser.customRole?.name === 'Owner';
      if (!isOwner) {
        throw new ForbiddenException('Only the workspace owner can change the workspace name.');
      }
      await this.prisma.workspace.update({
        where: { id: targetUser.workspaceId },
        data: { name: dto.workspaceName },
      });
    }

    // Password update
    if (dto.newPassword) {
      if (!targetUser.passwordHash) {
        throw new BadRequestException(
          'This account uses Google sign-in and has no local password. Set one via password reset if needed.',
        );
      }
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to set a new password.');
      }
      const isPasswordValid = await bcrypt.compare(
        dto.currentPassword,
        targetUser.passwordHash,
      );
      if (!isPasswordValid) {
        throw new BadRequestException('Incorrect current password.');
      }
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(dto.newPassword, salt);
    }

    // Permission flags are exclusive to platform owners (not against root)
    if (isPlatformOwner(callingUser) && !targetIsRoot) {
      if (dto.canViewOthers !== undefined) updateData.canViewOthers = dto.canViewOthers;
      if (dto.canManagePermissions !== undefined) updateData.canManagePermissions = dto.canManagePermissions;
    }

    const passwordChanged = Boolean(dto.newPassword);
    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        customRole: true,
        workspace: true,
      },
    });

    if (passwordChanged && updated.email) {
      const userName =
        updated.name ||
        [updated.firstName, updated.lastName].filter(Boolean).join(' ') ||
        null;
      this.eventEmitter.emit(
        PASSWORD_CHANGED_EVENT,
        new PasswordChangedEvent(updated.id, updated.email, userName, 'changed'),
      );
    }

    return updated;
  }

  private async assertCanManageUser(
    workspaceId: string,
    id: string,
    callingUserId: string,
  ) {
    const callingUser = await this.prisma.user.findUnique({
      where: { id: callingUserId },
    });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException('User not found or access denied.');

    if (!isPlatformOwner(callingUser)) {
      if (id !== callingUserId) {
        const allUsers = await this.prisma.user.findMany({ where: { workspaceId } });
        const descendantIds = this.getDescendantIds(allUsers, callingUserId);
        if (!descendantIds.includes(id)) {
          throw new ForbiddenException('Access denied.');
        }
      }
      if (!callingUser.canManagePermissions) {
        throw new ForbiddenException('Access denied.');
      }
    }

    return { callingUser, targetUser };
  }

  /** Soft delete — deactivates the account (status = Inactive). */
  async softDeleteUser(workspaceId: string, id: string, callingUserId: string) {
    const { callingUser, targetUser } = await this.assertCanManageUser(
      workspaceId,
      id,
      callingUserId,
    );

    if (id === callingUserId) {
      throw new BadRequestException('You cannot soft-delete your own account.');
    }
    if (isRootPlatformOwner(targetUser)) {
      throw new ForbiddenException(
        'The root platform owner cannot be deactivated.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'Inactive' },
      include: { customRole: true, workspace: true },
    });

    return {
      ...updated,
      deleteType: 'soft' as const,
      message: `${targetUser.name || targetUser.email} has been deactivated.`,
      managedBy: callingUser.email,
    };
  }

  /** @deprecated Prefer softDeleteUser — kept for existing clients. */
  async deactivateUser(workspaceId: string, id: string, callingUserId: string) {
    return this.softDeleteUser(workspaceId, id, callingUserId);
  }

  /**
   * Hard delete — permanently removes the user.
   * Quizzes they created are reassigned to the acting admin so content is kept.
   */
  async hardDeleteUser(workspaceId: string, id: string, callingUserId: string) {
    const { callingUser, targetUser } = await this.assertCanManageUser(
      workspaceId,
      id,
      callingUserId,
    );

    if (id === callingUserId) {
      throw new BadRequestException('You cannot permanently delete your own account.');
    }
    if (isRootPlatformOwner(targetUser)) {
      throw new ForbiddenException(
        'The root platform owner cannot be permanently deleted.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Keep quiz content; transfer ownership to the acting admin
      await tx.quiz.updateMany({
        where: { createdById: id },
        data: { createdById: callingUserId },
      });
      await tx.question.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      });
      await tx.quizAttempt.updateMany({
        where: { studentId: id },
        data: { studentId: null },
      });
      await tx.accessReview.deleteMany({ where: { reviewerId: id } });
      // Clear hierarchy pointers that still reference this user as inviter
      await tx.user.updateMany({
        where: { invitedById: id },
        data: { invitedById: null },
      });
      await tx.user.delete({ where: { id } });
    });

    return {
      status: 'deleted' as const,
      deleteType: 'hard' as const,
      id,
      email: targetUser.email,
      message: `${targetUser.name || targetUser.email} has been permanently deleted.`,
      managedBy: callingUser.email,
    };
  }

  /** Activate a pending teacher profile and notify the teacher by email. */
  async activateTeacherProfile(
    workspaceId: string,
    id: string,
    callingUserId: string,
  ) {
    const { callingUser, targetUser } = await this.assertCanManageUser(
      workspaceId,
      id,
      callingUserId,
    );

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: id },
    });
    if (!profile) {
      throw new BadRequestException(
        'This user does not have a teacher profile to activate.',
      );
    }
    if (profile.reviewStatus === 'Active') {
      throw new BadRequestException('This teacher profile is already active.');
    }

    const updated = await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: { reviewStatus: 'Active' },
    });

    this.eventEmitter.emit(
      TEACHER_ACTIVATED_EVENT,
      new TeacherActivatedEvent(
        targetUser.id,
        targetUser.email,
        targetUser.name,
        `/t/${updated.slug}`,
      ),
    );

    return {
      status: 'activated' as const,
      userId: id,
      teacherProfile: {
        id: updated.id,
        slug: updated.slug,
        reviewStatus: updated.reviewStatus,
        isPublic: updated.isPublic,
      },
      message: `${targetUser.name || targetUser.email}'s teacher profile is now active. A confirmation email was sent.`,
      managedBy: callingUser.email,
    };
  }

  async inviteUser(workspaceId: string, id: string, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({ where: { id: callingUserId } });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Fetch target user with access bypass for Udaya
    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException();

    if (!isPlatformOwner(callingUser)) {
      const allUsers = await this.prisma.user.findMany({ where: { workspaceId } });
      const descendantIds = this.getDescendantIds(allUsers, callingUserId);
      if (!descendantIds.includes(id)) {
        throw new ForbiddenException('Access denied.');
      }
      if (!callingUser.canManagePermissions) {
        throw new ForbiddenException('Access denied.');
      }
    }

    const invitedByName =
      callingUser.name ||
      [callingUser.firstName, callingUser.lastName].filter(Boolean).join(' ') ||
      callingUser.email;
    const userName =
      targetUser.name ||
      [targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ') ||
      null;

    this.eventEmitter.emit(
      USER_INVITE_EVENT,
      new UserInviteEvent(
        targetUser.id,
        targetUser.email,
        userName,
        invitedByName,
      ),
    );

    return {
      status: 'success',
      message: `Invitation successfully resent to ${targetUser.email}.`,
    };
  }
}
