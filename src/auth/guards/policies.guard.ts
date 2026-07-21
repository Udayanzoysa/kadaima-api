import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Action } from '@prisma/client';
import { AbilityFactory } from '../casl/ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../decorators/policies.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) || [];
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
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

    if (!dbUser) return false;

    // Create the dynamic capability matrix for the requesting user
    const ability = this.abilityFactory.createForUser(dbUser);

    // Enforce every validation handler evaluates to true.
    // MANAGE (and SUPER_ADMIN manage all) also satisfies specific actions like DELETE.
    return policyHandlers.every(
      (handler) =>
        ability.can(handler.action, handler.subject) ||
        ability.can(Action.MANAGE, handler.subject) ||
        ability.can('manage' as any, handler.subject as any) ||
        ability.can('manage' as any, 'all'),
    );
  }
}
