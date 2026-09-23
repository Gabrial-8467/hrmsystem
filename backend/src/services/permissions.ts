import type { PrismaClient } from '@prisma/client';

export interface LoadedPermissionContext {
  userId: string;
  organizationId: string;
  roles: { id: string; code: string; name: string }[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
}

interface CacheEntry {
  expiresAt: number;
  value: LoadedPermissionContext;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Loads a user's roles and effective permission set. Results are cached
 * in-process for CACHE_TTL_MS. A role granted the superset permission '*' is
 * treated as full access within its scope.
 */
export async function loadUserAuthorization(
  prisma: PrismaClient,
  userId: string,
): Promise<LoadedPermissionContext> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          scope: true,
          isActive: true,
          permissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      },
    },
  });

  const activeRoles = userRoles.filter((ur) => ur.role.isActive);
  const roles = activeRoles.map((ur) => ({
    id: ur.role.id,
    code: ur.role.code,
    name: ur.role.name,
  }));

  const permissionSet = new Set<string>();
  let isSuperAdmin = false;
  for (const ur of activeRoles) {
    if (ur.role.scope === 'PLATFORM') {
      isSuperAdmin = true;
    }
    for (const rp of ur.role.permissions) {
      if (rp.permission.key === '*') continue;
      permissionSet.add(rp.permission.key);
    }
  }

  const value: LoadedPermissionContext = {
    userId: user.id,
    organizationId: user.organizationId,
    roles,
    permissions: permissionSet,
    isSuperAdmin,
  };

  cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function invalidateUserAuthCache(userId: string): void {
  cache.delete(userId);
}