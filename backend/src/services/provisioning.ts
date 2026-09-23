import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES, SUPERSET_KEY } from '../config/permissions';
import { hashPassword } from '../utils/password';
import { ConflictError } from '../utils/errors';

export interface ProvisionOrgInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminPassword: string;
  plan?: string;
  timezone?: string;
  currency?: string;
}

/**
 * Provisions a new tenant: syncs the permission registry, creates organization
 * system roles and an initial admin user. Used both by the platform API and by
 * the seed script so behavior stays identical.
 */
export async function provisionOrganization(
  prisma: PrismaClient,
  input: ProvisionOrgInput,
): Promise<{ organizationId: string; adminUserId: string }> {
  return prisma.$transaction(async (tx) => {
    const slugExists = await tx.organization.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (slugExists) {
      throw new ConflictError('An organization with this slug already exists', 'SLUG_TAKEN');
    }

    // Ensure the permission registry is synced before referencing it.
    for (const p of PERMISSIONS) {
      await tx.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, module: p.module, name: p.name, description: p.description ?? null },
        update: {},
      });
    }

    const organization = await tx.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        plan: (input.plan ?? 'FREE') as never,
        timezone: input.timezone ?? 'UTC',
        currency: input.currency ?? 'USD',
        status: 'ACTIVE',
      },
    });

    for (const def of SYSTEM_ROLES) {
      if (def.scope !== 'ORGANIZATION') continue;
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: def.name,
          code: def.code,
          description: def.description,
          scope: 'ORGANIZATION',
          isSystem: true,
        },
      });
      if (def.permissions.includes(SUPERSET_KEY)) {
        // Org superset roles get every non-platform permission. Platform
        // permissions stay exclusive to platform-scope super admins.
        const orgPermissions = await tx.permission.findMany({
          where: { module: { not: 'platform' } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: orgPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      } else {
        const perms = await tx.permission.findMany({
          where: { key: { in: def.permissions } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
    }

    const adminRole = await tx.role.findFirstOrThrow({
      where: { organizationId: organization.id, code: 'ORG_ADMIN' },
    });

    const passwordHash = await hashPassword(input.adminPassword);
    const adminUser = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: input.adminEmail.toLowerCase().trim(),
        firstName: input.adminFirstName,
        lastName: 'Admin',
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
        userRoles: { create: { roleId: adminRole.id, assignedBy: null } },
      },
    });

    return { organizationId: organization.id, adminUserId: adminUser.id };
  });
}