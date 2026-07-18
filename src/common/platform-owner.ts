import { Role } from '@prisma/client';

/** Canonical platform owner / seed super-admin email. */
export const PLATFORM_OWNER_EMAIL = 'unzoysa.un@gmail.com';

/** True for SUPER_ADMIN role or the configured platform owner email. */
export function isPlatformOwner(user: {
  email?: string | null;
  role?: Role | string | null;
}): boolean {
  if (user.role === Role.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
    return true;
  }
  return (user.email ?? '').toLowerCase() === PLATFORM_OWNER_EMAIL.toLowerCase();
}
