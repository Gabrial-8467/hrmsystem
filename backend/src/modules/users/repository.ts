import type { PrismaClient, Prisma } from '@prisma/client';
import type { PaginationParams } from '../../utils/pagination';

export interface UserFilters extends PaginationParams {
  organizationId: string;
  status?: string;
  role?: string;
}

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findInOrg(id: string, organizationId: string) {
    return this.prisma.user.findFirst({
      where: { id, organizationId },
      include: {
        userRoles: {
          select: { role: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  }

  private buildWhere(filters: UserFilters): Prisma.UserWhereInput {
    return {
      organizationId: filters.organizationId,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.role
        ? { userRoles: { some: { role: { code: filters.role } } } }
        : {}),
    };
  }

  async list(filters: UserFilters) {
    const where = this.buildWhere(filters);
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortDir = filters.sortDir;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { [sortBy]: sortDir },
        include: {
          userRoles: {
            select: { role: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  emailExists(email: string, excludeId?: string) {
    return this.prisma.user.findFirst({
      where: { email, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
  }

  createUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    title?: string | null;
    phone?: string | null;
    status?: string;
    organizationId: string;
    roleIds: string[];
    assignedBy?: string | null;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: data.passwordHash,
        title: data.title ?? null,
        phone: data.phone ?? null,
        status: (data.status ?? 'ACTIVE') as never,
        organizationId: data.organizationId,
        userRoles: {
          create: data.roleIds.map((roleId) => ({
            roleId,
            assignedBy: data.assignedBy ?? null,
          })),
        },
      },
      include: {
        userRoles: {
          select: { role: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  }

  updateUser(id: string, data: {
    firstName?: string;
    lastName?: string;
    title?: string | null;
    phone?: string | null;
    status?: string;
  }) {
    return this.prisma.user.update({ where: { id }, data: { ...data, status: data.status as never | undefined } });
  }

  replaceRoles(id: string, roleIds: string[]) {
    return this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
    ]);
  }

  rolesByCodes(codes: string[], organizationId: string) {
    return this.prisma.role.findMany({
      where: {
        code: { in: codes },
        OR: [
          { organizationId },
          { scope: 'ORGANIZATION', organizationId: null },
        ],
      },
    });
  }
}