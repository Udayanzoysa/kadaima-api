import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export interface AuditMeta {
  subject: string;
  action: AuditAction;
}

export const AUDIT_KEY = 'audit_meta';

/**
 * Marks a controller route as auditable. Picked up by the global
 * `AuditInterceptor`, which logs the action after a successful response —
 * routes without this decorator are untouched (zero overhead).
 */
export const Audit = (subject: string, action: AuditAction) =>
  SetMetadata(AUDIT_KEY, { subject, action } as AuditMeta);
