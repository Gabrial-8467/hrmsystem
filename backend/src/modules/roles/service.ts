import type { PrismaClient } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { invalidateUserAuthCache } from '../../services/permissions';
import type { CreateRoleInput, UpdateRoleInput } from './schema';

export interface RoleView {
  id: string;
  name: string;
  code: string;
  description: string | null;
  scope: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  userCount: number;
}

interface PermissionRef {
  id: string;
  key: string;
  module: string;
}

export class RoleService {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolvePermissions(keys: string[]) {
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true, module: true },
    });
    const found = new Set(perms.map((p) => p.key));
    const missing = keys.filter((k) => !found.has(k));
    const platform = perms.filter((p) => p.module === 'platform');
    return { perms, missing, platform };
  }

  private async getOwnedRole(orgId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: orgId },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        userRoles: { select: { userId: true } },
      },
    });
    if (!role) {
      throw new NotFoundError('Role not found', 'ROLE_NOT_FOUND');
    }
    return role;
  }

  private toView(
    role: {
      id: string;
      name: string;
      code: string;
      description: string | null;
      scope: string;
      isSystem: boolean;
      isActive: boolean;
      permissions: { permission: { key: string } }[];
    },
    userCount: number,
  ): RoleView {
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      scope: role.scope,
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissions: role.permissions.map((rp) => rp.permission.key),
      userCount,
    };
  }

  async list(orgId: string) {
    const roles = await this.prisma.role.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        scope: true,
        isSystem: true,
        isActive: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      scope: r.scope,
      isSystem: r.isSystem,
      isActive: r.isActive,
      permissions: r.permissions.map((p) => p.permission.key),
      userCount: r._count.userRoles,
    }));
  }

  async get(orgId: string, roleId: string): Promise<RoleView> {
    const role = await this.getOwnedRole(orgId, roleId);
    return this.toView(role, role.userRoles.length);
  }

  async create(orgId: string, input: CreateRoleInput): Promise<RoleView> {
    const existing = await this.prisma.role.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: input.code } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError(`A role with code ${input.code} already exists`, 'ROLE_CODE_TAKEN');
    }

    const { perms, missing, platform } = await this.resolvePermissions(input.permissions);
    if (missing.length) {
      throw new BadRequestError('One or more permissions are unknown', 'INVALID_PERMISSIONS', { missing });
    }
    if (platform.length) {
      throw new BadRequestError(
        'Platform permissions cannot be granted to organization roles',
        'INVALID_PERMISSIONS',
        { platform: platform.map((p) => p.key) },
      );
    }

    const role = await this.prisma.role.create({
      data: {
        organizationId: orgId,
        name: input.name.trim(),
        code: input.code,
        description: input.description ?? null,
        scope: 'ORGANIZATION',
        isSystem: false,
        isActive: true,
        permissions: { create: perms.map((p: PermissionRef) => ({ permissionId: p.id })) },
      },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { userRoles: true } },
      },
    });

    return this.toView(role, role._count.userRoles);
  }

  async update(orgId: string, roleId: string, input: UpdateRoleInput): Promise<RoleView> {
    const role = await this.getOwnedRole(orgId, roleId);
    if (role.isSystem) {
      throw new BadRequestError('System roles cannot be modified', 'SYSTEM_ROLE_LOCKED');
    }

    let permissionRefs: PermissionRef[] | null = null;
    if (input.permissions) {
      const resolved = await this.resolvePermissions(input.permissions);
      if (resolved.missing.length) {
        throw new BadRequestError('One or more permissions are unknown', 'INVALID_PERMISSIONS', {
          missing: resolved.missing,
        });
      }
      if (resolved.platform.length) {
        throw new BadRequestError(
          'Platform permissions cannot be granted to organization roles',
          'INVALID_PERMISSIONS',
          { platform: resolved.platform.map((p) => p.key) },
        );
      }
      permissionRefs = resolved.perms;
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        description: input.description !== undefined ? input.description : undefined,
        isActive: input.isActive,
        ...(permissionRefs
          ? {
              permissions: {
                deleteMany: {},
                create: permissionRefs.map((p) => ({ permissionId: p.id })),
              },
            }
          : {}),
      },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        userRoles: { select: { userId: true } },
        _count: { select: { userRoles: true } },
      },
    });

    for (const ur of updated.userRoles) {
      invalidateUserAuthCache(ur.userId);
    }

    return this.toView(updated, updated._count.userRoles);
  }

  async remove(orgId: string, roleId: string): Promise<void> {
    const role = await this.getOwnedRole(orgId, roleId);
    if (role.isSystem) {
      throw new BadRequestError('System roles cannot be deleted', 'SYSTEM_ROLE_LOCKED');
    }
    if (role.userRoles.length > 0) {
      throw new BadRequestError(
        'Role is assigned to users and cannot be deleted',
        'ROLE_IN_USE',
        { userCount: role.userRoles.length },
      );
    }
    const deadUserIds = role.userRoles.map((ur) => ur.userId);
    await this.prisma.role.delete({ where: { id: roleId } });
    for (const id of deadUserIds) {
      invalidateUserAuthCache(id);
    }
  }
}