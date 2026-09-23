import type { PrismaClient } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { paginate } from '../../utils/pagination';
import { UserRepository } from './repository';
import type { CreateUserInput, UpdateUserInput } from './schema';
import { hashPassword } from '../../utils/password';
import { invalidateUserAuthCache } from '../../services/permissions';

export interface UserFiltersInput {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  status?: string;
  role?: string;
}

export class UserService {
  private readonly repo: UserRepository;

  constructor(prisma: PrismaClient) {
    this.repo = new UserRepository(prisma);
  }

  async list(requesterOrgId: string, filters: UserFiltersInput) {
    const { items, total } = await this.repo.list({
      ...filters,
      organizationId: requesterOrgId,
    });
    return paginate(
      items.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        title: u.title,
        phone: u.phone,
        status: u.status,
        avatarUrl: u.avatarUrl,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        roles: u.userRoles.map((ur) => urlRole(ur.role)),
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      total,
      filters,
    );
  }

  async get(requesterOrgId: string, id: string) {
    const user = await this.repo.findInOrg(id, requesterOrgId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      phone: user.phone,
      status: user.status,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      roles: user.userRoles.map((ur) => urlRole(ur.role)),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async getByEmailForPlatform(email: string) {
    const user = await this.repo.emailExists(email);
    return user;
  }

  async create(requesterOrgId: string, input: CreateUserInput, assignedBy: string) {
    const duplicate = await this.repo.emailExists(input.email);
    if (duplicate) {
      throw new ConflictError('A user with this email already exists', 'EMAIL_TAKEN');
    }

    const roles = await this.repo.rolesByCodes(input.roleCodes, requesterOrgId);
    if (roles.length !== input.roleCodes.length) {
      throw new BadRequestError(
        'One or more roles are invalid for this organization',
        'INVALID_ROLES',
        { requested: input.roleCodes, found: roles.map((r) => r.code) },
      );
    }
    if (roles.some((r) => r.scope === 'PLATFORM')) {
      throw new UnauthorizedError('Platform roles cannot be assigned within an organization', 'INVALID_ROLES');
    }

    const passwordHash = await hashPassword(input.password ?? randomInitialPassword());

    const user = await this.repo.createUser({
      ...input,
      passwordHash,
      organizationId: requesterOrgId,
      roleIds: roles.map((r) => r.id),
      assignedBy,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      status: user.status,
      roles: user.userRoles.map((ur) => urlRole(ur.role)),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async update(requesterOrgId: string, id: string, input: UpdateUserInput, actorId: string) {
    const existing = await this.repo.findInOrg(id, requesterOrgId);
    if (!existing) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    if (existing.id === actorId && input.status === 'DEACTIVATED') {
      throw new BadRequestError('You cannot deactivate your own account', 'SELF_DEACTIVATION');
    }

    if (input.roleCodes) {
      const roles = await this.repo.rolesByCodes(input.roleCodes, requesterOrgId);
      if (roles.length !== input.roleCodes.length) {
        throw new BadRequestError('One or more roles are invalid for this organization', 'INVALID_ROLES');
      }
      if (roles.some((r) => r.scope === 'PLATFORM')) {
        throw new UnauthorizedError('Platform roles cannot be assigned within an organization', 'INVALID_ROLES');
      }
      await this.repo.replaceRoles(id, roles.map((r) => r.id));
    }

    const updated = await this.repo.updateUser(id, {
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      phone: input.phone,
      status: input.status,
    });

    invalidateUserAuthCache(id);

    return this.get(requesterOrgId, updated.id);
  }

  async delete(requesterOrgId: string, id: string, actorId: string) {
    const existing = await this.repo.findInOrg(id, requesterOrgId);
    if (!existing) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    if (existing.id === actorId) {
      throw new BadRequestError('You cannot delete your own account', 'SELF_DELETION');
    }
    await this.repo.updateUser(id, { status: 'DEACTIVATED' });
    invalidateUserAuthCache(id);
  }
}

function urlRole(role: { id: string; code: string; name: string }) {
  return { id: role.id, code: role.code, name: role.name };
}

function randomInitialPassword(): string {
  return `Temp@${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}