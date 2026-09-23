import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES, SUPERSET_KEY } from '../config/permissions';
import { logger } from '../utils/logger';

/**
 * Reconciles the permission registry and system roles with the database.
 *
 * The permission/role configuration in `src/config/permissions.ts` is the
 * single source of truth. New permissions and system-role definition changes
 * must propagate to every already-provisioned organization — a fresh seed alone
 * is not enough. This service is idempotent and designed to run once at server
 * startup (see `server.ts`).
 *
 * Custom (non-system) roles are never modified.
 */
export async function syncPermissionsAndSystemRoles(prisma: PrismaClient): Promise<void> {
  const registeredKeys = new Set(PERMISSIONS.map((p) => p.key));

  // 1. Upsert every registered permission so new keys exist before roles link them.
  await prisma.$transaction(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, module: p.module, name: p.name, description: p.description ?? null },
        update: { module: p.module, name: p.name, description: p.description ?? null },
      }),
    ),
  );

  // 2. Reconcile each organization's system roles against the config.
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  for (const org of organizations) {
    await reconcileSystemRolesForOrg(prisma, org.id, registeredKeys);
  }
}

async function reconcileSystemRolesForOrg(
  prisma: PrismaClient,
  organizationId: string,
  registeredKeys: ReadonlySet<string>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const def of SYSTEM_ROLES) {
      if (def.scope !== 'ORGANIZATION') continue;

      let role = await tx.role.findFirst({
        where: { organizationId, code: def.code },
        select: { id: true, isSystem: true },
      });

      if (!role) {
        // A system role newly added to the config: provision it for this org.
        const created = await tx.role.create({
          data: {
            organizationId,
            name: def.name,
            code: def.code,
            description: def.description,
            scope: 'ORGANIZATION',
            isSystem: true,
          },
          select: { id: true },
        });
        role = { id: created.id, isSystem: true };
      } else if (!role.isSystem) {
        // A custom role collides with a system role code. Never touch it.
        logger.warn({ organizationId, code: def.code }, '[permission-sync] non-system role collides with system role code; skipping');
        continue;
      }

      // Superset roles receive every non-platform permission, matching provisioning.
      const desiredKeys = def.permissions.includes(SUPERSET_KEY)
        ? (await tx.permission.findMany({
            where: { module: { not: 'platform' } },
            select: { key: true },
          })).map((p) => p.key)
        : def.permissions;

      const missing = desiredKeys.filter((key) => !registeredKeys.has(key));
      if (missing.length > 0) {
        logger.warn(
          { roleCode: def.code, missing },
          '[permission-sync] system role references unregistered permission key(s); they will be skipped',
        );
      }

      const perms = await tx.permission.findMany({
        where: { key: { in: desiredKeys } },
        select: { id: true },
      });
      const desiredIds = new Set(perms.map((p) => p.id));

      const existing = await tx.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const existingIds = new Set(existing.map((e) => e.permissionId));

      const toCreate = [...desiredIds].filter((id) => !existingIds.has(id));
      const toDelete = [...existingIds].filter((id) => !desiredIds.has(id));

      if (toDelete.length > 0) {
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: toDelete } },
        });
      }
      if (toCreate.length > 0) {
        await tx.rolePermission.createMany({
          data: toCreate.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    }
  });
}