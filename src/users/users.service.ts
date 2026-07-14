import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { validateAndCleanSriLankanNumber } from '../common/phone-validator';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    if (callingUser.email !== 'udaya@gmail.com') {
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

    return this.prisma.user.findMany({
      where,
      include: {
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
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getUserById(workspaceId: string, id: string, callingUserId?: string) {
    let callingUserEmail = '';
    if (callingUserId) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callingUserId },
      });
      callingUserEmail = caller?.email || '';
    }

    const where: any = { id };
    if (callingUserEmail !== 'udaya@gmail.com') {
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
    if (callingUser.email !== 'udaya@gmail.com' && !callingUser.canManagePermissions) {
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
    const canViewOthers = callingUser.email === 'udaya@gmail.com' ? !!dto.canViewOthers : false;
    const canManagePermissions = callingUser.email === 'udaya@gmail.com' ? !!dto.canManagePermissions : false;

    return this.prisma.user.create({
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
  }

  async updateUser(workspaceId: string, id: string, dto: UpdateUserDto, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({
      where: { id: callingUserId },
    });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Fetch target user with Udaya email claim verification bypass
    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException();

    // Hierarchical update verification
    if (callingUser.email !== 'udaya@gmail.com') {
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

    // Permission flags are exclusive to Level 0
    if (callingUser.email === 'udaya@gmail.com') {
      if (dto.canViewOthers !== undefined) updateData.canViewOthers = dto.canViewOthers;
      if (dto.canManagePermissions !== undefined) updateData.canManagePermissions = dto.canManagePermissions;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        customRole: true,
        workspace: true,
      },
    });
  }

  async deactivateUser(workspaceId: string, id: string, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({ where: { id: callingUserId } });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Fetch target user with access bypass for Udaya
    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException();

    if (callingUser.email !== 'udaya@gmail.com') {
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

    return this.prisma.user.update({
      where: { id },
      data: {
        status: 'Inactive',
      },
    });
  }

  async inviteUser(workspaceId: string, id: string, callingUserId: string) {
    const callingUser = await this.prisma.user.findUnique({ where: { id: callingUserId } });
    if (!callingUser) throw new NotFoundException('Calling user not found.');

    // Fetch target user with access bypass for Udaya
    const targetUser = await this.getUserById(workspaceId, id, callingUserId);
    if (!targetUser) throw new NotFoundException();

    if (callingUser.email !== 'udaya@gmail.com') {
      const allUsers = await this.prisma.user.findMany({ where: { workspaceId } });
      const descendantIds = this.getDescendantIds(allUsers, callingUserId);
      if (!descendantIds.includes(id)) {
        throw new ForbiddenException('Access denied.');
      }
      if (!callingUser.canManagePermissions) {
        throw new ForbiddenException('Access denied.');
      }
    }

    return {
      status: 'success',
      message: `Invitation successfully resent to ${targetUser.email}.`,
    };
  }
}
