import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/utils/password';
import { SUPERSET_KEY } from '../../src/config/permissions';

const PLATFORM_SLUG = 'platform';

export async function seedPlatform(prisma: PrismaClient): Promise<void> {
  let platform = await prisma.organization.findUnique({ where: { slug: PLATFORM_SLUG } });
  if (!platform) {
    platform = await prisma.organization.create({
      data: {
        name: 'HRMS Platform',
        slug: PLATFORM_SLUG,
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
      },
    });
  }

  let role = await prisma.role.findFirst({
    where: { organizationId: platform.id, code: 'SUPER_ADMIN' },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        organizationId: platform.id,
        name: 'Super Admin',
        code: 'SUPER_ADMIN',
        description: 'Platform-level administrator with full access.',
        scope: 'PLATFORM',
        isSystem: true,
      },
    });
  }

  const marker = await prisma.permission.upsert({
    where: { key: SUPERSET_KEY },
    create: { key: SUPERSET_KEY, module: 'platform', name: 'Full Access', description: 'Grants everything within scope' },
    update: {},
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: marker.id } },
    create: { roleId: role.id, permissionId: marker.id },
    update: {},
  });

  const superAdminEmail = 'superadmin@hrms.dev';
  const existingUser = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        organizationId: platform.id,
        email: superAdminEmail,
        firstName: 'Platform',
        lastName: 'Admin',
        passwordHash: await hashPassword('SuperAdmin@123'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        title: 'Super Admin',
        userRoles: { create: { roleId: role.id } },
      },
    });
  }
  console.log('[seed] Platform + super admin ready (superadmin@hrms.dev / SuperAdmin@123)');
}