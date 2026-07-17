import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditMeta } from './audit-log.decorator';
import { AuditService } from './audit.service';

function resolveIp(req: any): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function resolveTargetId(req: any, result: any): string | null {
  if (req.params?.id) return String(req.params.id);
  if (result && typeof result === 'object' && 'id' in result) {
    return String((result as { id: unknown }).id);
  }
  return null;
}

/**
 * Global interceptor — no-op unless the route handler carries `@Audit(...)`
 * metadata. Fires the audit write after a successful response without
 * delaying it (fire-and-forget).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((result) => {
        void this.auditService.log({
          action: meta.action,
          subject: meta.subject,
          actor: req.user
            ? {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
              }
            : null,
          targetId: resolveTargetId(req, result),
          ip: resolveIp(req),
          userAgent: req.headers?.['user-agent'] ?? null,
        });
      }),
    );
  }
}
