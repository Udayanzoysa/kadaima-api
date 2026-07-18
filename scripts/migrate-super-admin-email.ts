import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const OLD_EMAIL = 'udaya@gmail.com';
const NEW_EMAIL = 'unzoysa.un@gmail.com';

async function main() {
  const oldUser = await prisma.user.findUnique({
    where: { email: OLD_EMAIL },
    include: { teacherProfile: true },
  });
  const newUser = await prisma.user.findUnique({
    where: { email: NEW_EMAIL },
    include: { teacherProfile: true },
  });

  console.log({
    old: oldUser
      ? {
          id: oldUser.id,
          role: oldUser.role,
          status: oldUser.status,
          teacherReview: oldUser.teacherProfile?.reviewStatus ?? null,
        }
      : null,
    new: newUser
      ? {
          id: newUser.id,
          role: newUser.role,
          status: newUser.status,
          teacherReview: newUser.teacherProfile?.reviewStatus ?? null,
        }
      : null,
  });

  if (oldUser && !newUser) {
    const updated = await prisma.user.update({
      where: { email: OLD_EMAIL },
      data: {
        email: NEW_EMAIL,
        name: 'Super Admin',
        firstName: 'Super',
        lastName: 'Admin',
        role: Role.SUPER_ADMIN,
        status: 'Active',
        canViewOthers: true,
        canManagePermissions: true,
      },
    });
    console.log('Updated email to', updated.email);

    if (oldUser.teacherProfile && oldUser.teacherProfile.reviewStatus !== 'Active') {
      await prisma.teacherProfile.update({
        where: { id: oldUser.teacherProfile.id },
        data: { reviewStatus: 'Active' },
      });
      console.log('Activated teacher profile on super admin');
    }
    return;
  }

  if (oldUser && newUser) {
    await prisma.user.update({
      where: { email: NEW_EMAIL },
      data: {
        role: Role.SUPER_ADMIN,
        status: 'Active',
        canViewOthers: true,
        canManagePermissions: true,
      },
    });
    if (newUser.teacherProfile && newUser.teacherProfile.reviewStatus !== 'Active') {
      await prisma.teacherProfile.update({
        where: { id: newUser.teacherProfile.id },
        data: { reviewStatus: 'Active' },
      });
    }
    await prisma.user.update({
      where: { email: OLD_EMAIL },
      data: { status: 'Inactive' },
    });
    console.log('Promoted', NEW_EMAIL, 'and deactivated', OLD_EMAIL);
    return;
  }

  if (!oldUser && newUser) {
    await prisma.user.update({
      where: { email: NEW_EMAIL },
      data: {
        role: Role.SUPER_ADMIN,
        status: 'Active',
        canViewOthers: true,
        canManagePermissions: true,
      },
    });
    if (newUser.teacherProfile && newUser.teacherProfile.reviewStatus !== 'Active') {
      await prisma.teacherProfile.update({
        where: { id: newUser.teacherProfile.id },
        data: { reviewStatus: 'Active' },
      });
    }
    console.log('Promoted existing', NEW_EMAIL, 'to SUPER_ADMIN');
    return;
  }

  console.log('Neither user found — create via seed or admin UI');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
