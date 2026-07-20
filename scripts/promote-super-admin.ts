import { PrismaClient, Role } from '@prisma/client';

/**
 * One-time: promote udayaenvision@gmail.com to SUPER_ADMIN.
 * Root platform owner (unzoysa.un@gmail.com) remains unchanged.
 *
 * Usage: npx ts-node scripts/promote-super-admin.ts
 */
const prisma = new PrismaClient();
const TARGET_EMAIL = 'udayaenvision@gmail.com';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    include: { customRole: true },
  });

  if (!user) {
    console.error(`User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const ownerRole = await prisma.customRole.findFirst({
    where: { workspaceId: user.workspaceId, name: 'Owner' },
    select: { id: true },
  });

  const updated = await prisma.user.update({
    where: { email: TARGET_EMAIL },
    data: {
      role: Role.SUPER_ADMIN,
      status: 'Active',
      canViewOthers: true,
      canManagePermissions: true,
      team: 'Executive',
      ...(ownerRole ? { customRoleId: ownerRole.id } : {}),
    },
    include: { customRole: true },
  });

  console.log('Promoted to SUPER_ADMIN:', {
    id: updated.id,
    email: updated.email,
    role: updated.role,
    team: updated.team,
    customRole: updated.customRole?.name ?? null,
    canViewOthers: updated.canViewOthers,
    canManagePermissions: updated.canManagePermissions,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
