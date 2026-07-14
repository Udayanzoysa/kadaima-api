import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionSetDto } from './dto/create-permission-set.dto';
import { UpdatePermissionSetDto } from './dto/update-permission-set.dto';
import { CreateAccessReviewDto } from './dto/create-access-review.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class AccessControlService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // ROLES BUSINESS LOGIC
  // ==========================================

  async getRoles(
    workspaceId: string,
    query: { type?: string; owner?: string; status?: string; search?: string },
  ) {
    const where: any = { workspaceId };

    if (query.owner) {
      where.owner = query.owner;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      if (query.type === 'System') {
        where.isSystem = true;
      } else if (query.type === 'Custom') {
        where.isSystem = false;
      }
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    return this.prisma.customRole.findMany({
      where,
      include: {
        permissionSets: {
          include: {
            permissions: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRoleById(workspaceId: string, id: string) {
    const role = await this.prisma.customRole.findFirst({
      where: { id, workspaceId },
      include: {
        permissionSets: {
          include: {
            permissions: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) throw new NotFoundException('Role not found or access denied.');
    return role;
  }

  async createRole(workspaceId: string, dto: CreateRoleDto) {
    const wsExists = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!wsExists)
      throw new NotFoundException(
        `Workspace with ID "${workspaceId}" does not exist.`,
      );

    const existing = await this.prisma.customRole.findFirst({
      where: { workspaceId, name: dto.name },
    });
    if (existing)
      throw new BadRequestException(
        `Role name "${dto.name}" already exists in this workspace.`,
      );

    return this.prisma.customRole.create({
      data: {
        workspaceId,
        name: dto.name,
        accessLevel: dto.accessLevel,
        description: dto.description,
        status: dto.status || 'Active',
        owner: dto.owner || 'System',
        isSystem: false,
        permissionSets: dto.permissionSetIds
          ? { connect: dto.permissionSetIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        permissionSets: true,
      },
    });
  }

  async updateRole(workspaceId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.getRoleById(workspaceId, id);

    if (role.isSystem && dto.name) {
      throw new BadRequestException(
        'Standard system roles cannot have their name modified.',
      );
    }

    return this.prisma.customRole.update({
      where: { id },
      data: {
        name: dto.name,
        accessLevel: dto.accessLevel,
        description: dto.description,
        status: dto.status,
        owner: dto.owner,
        permissionSets: dto.permissionSetIds
          ? { set: dto.permissionSetIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        permissionSets: true,
      },
    });
  }

  async deleteRole(workspaceId: string, id: string) {
    const role = await this.getRoleById(workspaceId, id);
    if (role.isSystem)
      throw new BadRequestException('Standard system roles cannot be deleted.');

    return this.prisma.customRole.delete({
      where: { id },
    });
  }

  async reviewRole(
    workspaceId: string,
    id: string,
    reviewerId: string,
    notes?: string,
  ) {
    await this.getRoleById(workspaceId, id);

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.accessReview.create({
        data: {
          workspaceId,
          roleId: id,
          reviewerId,
          status: 'Approved',
          notes: notes || 'Access review completed successfully.',
        },
        include: {
          role: { select: { name: true } },
          reviewer: { select: { id: true, email: true } },
        },
      });

      await tx.customRole.update({
        where: { id },
        data: {
          status: 'Active',
          lastReview: new Date(),
        },
      });

      return review;
    });
  }

  async assignRoleToUsers(workspaceId: string, id: string, dto: AssignRoleDto) {
    await this.getRoleById(workspaceId, id);

    // Verify all userIds belong to the same workspace
    const usersCount = await this.prisma.user.count({
      where: {
        workspaceId,
        id: { in: dto.userIds },
      },
    });

    if (usersCount !== dto.userIds.length) {
      throw new BadRequestException(
        'One or more user IDs are invalid or belong to another workspace.',
      );
    }

    // Unassign all users from this role in the workspace first
    await this.prisma.user.updateMany({
      where: {
        workspaceId,
        customRoleId: id,
      },
      data: {
        customRoleId: null,
      },
    });

    // Then associate new userIds list
    if (dto.userIds.length > 0) {
      await this.prisma.user.updateMany({
        where: {
          workspaceId,
          id: { in: dto.userIds },
        },
        data: {
          customRoleId: id,
        },
      });
    }

    return {
      status: 'success',
      message: `Assigned role to ${dto.userIds.length} users successfully.`,
    };
  }

  // ==========================================
  // PERMISSION SETS BUSINESS LOGIC
  // ==========================================

  async getPermissionSets(workspaceId: string) {
    return this.prisma.permissionSet.findMany({
      where: { workspaceId },
      include: {
        permissions: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getPermissionSetById(workspaceId: string, id: string) {
    const pSet = await this.prisma.permissionSet.findFirst({
      where: { id, workspaceId },
      include: {
        permissions: true,
        roles: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!pSet)
      throw new NotFoundException('Permission Set not found or access denied.');
    return pSet;
  }

  async createPermissionSet(workspaceId: string, dto: CreatePermissionSetDto) {
    const wsExists = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!wsExists)
      throw new NotFoundException(
        `Workspace with ID "${workspaceId}" does not exist.`,
      );

    const existing = await this.prisma.permissionSet.findFirst({
      where: { workspaceId, name: dto.name },
    });
    if (existing)
      throw new BadRequestException(
        `Permission Set name "${dto.name}" already exists.`,
      );

    return this.prisma.permissionSet.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        permissions: {
          create: dto.permissions.map((p) => ({
            action: p.action,
            subject: p.subject,
            conditions: p.conditions,
          })),
        },
      },
      include: {
        permissions: true,
      },
    });
  }

  async updatePermissionSet(
    workspaceId: string,
    id: string,
    dto: UpdatePermissionSetDto,
  ) {
    await this.getPermissionSetById(workspaceId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.permissions) {
        // Clear existing permissions inside the set first
        await tx.permission.deleteMany({
          where: { permissionSetId: id },
        });
      }

      return tx.permissionSet.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          permissions: dto.permissions
            ? {
                create: dto.permissions.map((p) => ({
                  action: p.action,
                  subject: p.subject,
                  conditions: p.conditions,
                })),
              }
            : undefined,
        },
        include: {
          permissions: true,
        },
      });
    });
  }

  async deletePermissionSet(workspaceId: string, id: string) {
    await this.getPermissionSetById(workspaceId, id);

    return this.prisma.permissionSet.delete({
      where: { id },
    });
  }

  // ==========================================
  // ACCESS REVIEWS BUSINESS LOGIC
  // ==========================================

  async getAccessReviews(workspaceId: string) {
    return this.prisma.accessReview.findMany({
      where: { workspaceId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  async createAccessReview(
    workspaceId: string,
    reviewerId: string,
    dto: CreateAccessReviewDto,
  ) {
    await this.getRoleById(workspaceId, dto.roleId);

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.accessReview.create({
        data: {
          workspaceId,
          roleId: dto.roleId,
          reviewerId,
          status: dto.status,
          notes: dto.notes || `Access reviewed and marked as ${dto.status}.`,
        },
        include: {
          role: { select: { name: true } },
          reviewer: { select: { id: true, email: true } },
        },
      });

      await tx.customRole.update({
        where: { id: dto.roleId },
        data: {
          status: dto.status === 'Approved' ? 'Active' : 'Needs review',
          lastReview: new Date(),
        },
      });

      return log;
    });
  }
}
