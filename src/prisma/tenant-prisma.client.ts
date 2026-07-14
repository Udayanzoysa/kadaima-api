import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaClient {
  public db;

  constructor(@Inject(REQUEST) private request: any) {
    const workspaceId = this.request.user?.workspaceId;

    // Extend Prisma Client on the fly to auto-filter on workspace context
    this.db = new PrismaClient().$extends({
      query: {
        user: {
          async findMany({ args, query }) {
            if (workspaceId && !args.where?.workspaceId) {
              args.where = { ...args.where, workspaceId };
            }
            return query(args);
          },
        },
      },
    });
  }
}
