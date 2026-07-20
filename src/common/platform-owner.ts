import { Role } from '@prisma/client';

/** Canonical root platform owner — immutable, alone can grant SUPER_ADMIN. */
export const PLATFORM_OWNER_EMAIL = 'unzoysa.un@gmail.com';

/** True only for the locked root account (email match). */
export function isRootPlatformOwner(user: {
  email?: string | null;
}): boolean {
  return (user.email ?? '').toLowerCase() === PLATFORM_OWNER_EMAIL.toLowerCase();
}

/** True for SUPER_ADMIN role or the configured root platform owner email. */
export function isPlatformOwner(user: {
  email?: string | null;
  role?: Role | string | null;
}): boolean {
  if (user.role === Role.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
    return true;
  }
  return isRootPlatformOwner(user);
}
