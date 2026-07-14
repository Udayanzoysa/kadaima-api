import { AbilityBuilder, createMongoAbility, Ability } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import {
  User,
  Action,
  Subject,
  Permission,
  CustomRole,
  PermissionSet,
} from '@prisma/client';

export type AppAbility = Ability<[Action | 'manage', Subject | 'all']>;

type UserWithPermissions = User & {
  permissions?: Permission[];
  customRole?:
    | (CustomRole & {
        permissionSets?: (PermissionSet & {
          permissions?: Permission[];
        })[];
      })
    | null;
};

@Injectable()
export class AbilityFactory {
  createForUser(user: UserWithPermissions) {
    const { can, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility as any,
    );

    // Rule 1: Super admins bypass all evaluations
    if (user.role === 'SUPER_ADMIN') {
      can('manage', 'all' as any);
    }

    // All users can read packages
    can(Action.READ, 'PACKAGES' as any);

    // Aggregate direct permissions and permissions from the custom role's permission sets
    const allPermissions: Permission[] = [];

    if (user.permissions) {
      allPermissions.push(...user.permissions);
    }

    if (user.customRole && user.customRole.permissionSets) {
      user.customRole.permissionSets.forEach((set) => {
        if (set.permissions) {
          allPermissions.push(...set.permissions);
        }
      });
    }

    // Rule 2: Loop through dynamic aggregated permissions
    allPermissions.forEach((perm) => {
      // Customers (CUSTOMER_ADMIN and normal USER) cannot access/manage Users, Roles, or Settings
      if (
        (user.role === 'CUSTOMER_ADMIN' || user.role === 'USER') &&
        (perm.subject === Subject.USERS ||
          perm.subject === Subject.ROLES ||
          perm.subject === Subject.SETTINGS)
      ) {
        return;
      }

      // Parse custom JSON conditions for ownership matching (e.g. Can only update campaigns they created)
      const condition = perm.conditions
        ? JSON.parse(
            JSON.stringify(perm.conditions).replace('{{userId}}', user.id),
          )
        : undefined;

      const action = perm.action === Action.MANAGE ? 'manage' : perm.action;
      can(action as any, perm.subject, condition);
    });

    return build({
      detectSubjectType: (item: any) => item.constructor,
    });
  }
}
