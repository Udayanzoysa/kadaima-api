import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_ID = 'default';

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface AuditLogEntry {
  action: AuditAction;
  subject: string;
  description?: string;
  actor?: AuditActor | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditListFilters {
  action?: AuditAction;
  subject?: string;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws — a logging failure must not break the real request. */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const enabled = await this.isEnabled();
      if (!enabled) return;

      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          subject: entry.subject,
          description: entry.description ?? null,
          actorId: entry.actor?.id ?? null,
          actorEmail: entry.actor?.email ?? null,
          actorName: entry.actor?.name ?? null,
          actorRole: entry.actor?.role ?? null,
          targetId: entry.targetId ?? null,
          ipAddress: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log (${entry.action} ${entry.subject}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async findMany(filters: AuditListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = filters.action;
    if (filters.subject) where.subject = filters.subject;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.search) {
      const search = filters.search.trim();
      if (search) {
        where.OR = [
          { actorEmail: { contains: search, mode: 'insensitive' } },
          { actorName: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { ipAddress: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: SETTINGS_ID },
      select: { auditLogEnabled: true },
    });
    return row?.auditLogEnabled ?? true;
  }

  async getSettings() {
    return { enabled: await this.isEnabled() };
  }

  async updateSettings(enabled: boolean, updatedBy?: string) {
    await this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, auditLogEnabled: enabled, updatedBy: updatedBy ?? null },
      update: { auditLogEnabled: enabled, updatedBy: updatedBy ?? null },
    });
    return { enabled };
  }
}
