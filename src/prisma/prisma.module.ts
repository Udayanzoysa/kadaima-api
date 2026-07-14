import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantPrismaClient } from './tenant-prisma.client';

@Global()
@Module({
  providers: [PrismaService, TenantPrismaClient],
  exports: [PrismaService, TenantPrismaClient],
})
export class PrismaModule {}
