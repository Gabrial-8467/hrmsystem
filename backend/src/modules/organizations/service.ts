import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../utils/errors';
import { provisionOrganization } from '../../services/provisioning';
import type { CreateOrganizationInput, UpdateOrganizationInput } from './schema';

const orgSummarySelect = Prisma.validator<Prisma.OrganizationSelect>()({
  id: true,
  name: true,
  slug: true,
  status: true,
  plan: true,
  logoUrl: true,
  timezone: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
});

export class OrganizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filters: { page: number; pageSize: number; search?: string; status?: string; plan?: string }) {
    const where: Prisma.OrganizationWhereInput = {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.plan ? { plan: filters.plan as never } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' as const } },
              { slug: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: 'desc' },
        select: { ...orgSummarySelect, _count: { select: { users: true, roles: true } } },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        plan: o.plan,
        logoUrl: o.logoUrl,
        timezone: o.timezone,
        currency: o.currency,
        userCount: o._count.users,
        roleCount: o._count.roles,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(total / filters.pageSize),
    };
  }

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        ...orgSummarySelect,
        address: true,
        phone: true,
        email: true,
        website: true,
        dateFormat: true,
        maxUsers: true,
        settings: true,
        _count: { select: { users: true, roles: true, auditLogs: true } },
      },
    });
    if (!org) throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      plan: org.plan,
      logoUrl: org.logoUrl,
      timezone: org.timezone,
      currency: org.currency,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      address: org.address,
      phone: org.phone,
      email: org.email,
      website: org.website,
      dateFormat: org.dateFormat,
      maxUsers: org.maxUsers,
      settings: org.settings ?? undefined,
      userCount: org._count.users,
      roleCount: org._count.roles,
      auditLogCount: org._count.auditLogs,
    };
  }

  async getOwn(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        logoUrl: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        timezone: true,
        currency: true,
        dateFormat: true,
        maxUsers: true,
        settings: true,
      },
    });
    if (!org) throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
    return { ...org, settings: org.settings ?? undefined };
  }

  async create(input: CreateOrganizationInput) {
    const initialPassword = `Temp@${randomBytes(9).toString('base64url')}`;
    const result = await provisionOrganization(this.prisma, {
      name: input.name,
      slug: input.slug,
      adminEmail: input.adminEmail,
      adminFirstName: input.adminFirstName,
      adminPassword: initialPassword,
      plan: input.plan,
      timezone: input.timezone,
      currency: input.currency,
    });
    return {
      ...result,
      initialPassword,
      organization: await this.get(result.organizationId),
    };
  }

  async update(orgId: string, input: UpdateOrganizationInput) {
    if (!(await this.prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } }))) {
      throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
    }
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        name: input.name,
        status: input.status as never | undefined,
        plan: input.plan as never | undefined,
        logoUrl: input.logoUrl,
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        timezone: input.timezone,
        currency: input.currency,
        dateFormat: input.dateFormat,
        maxUsers: input.maxUsers,
      },
    });
    return this.get(orgId);
  }

  async updateOwn(orgId: string, input: Omit<UpdateOrganizationInput, 'name' | 'status' | 'plan' | 'maxUsers'>) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        logoUrl: input.logoUrl,
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        timezone: input.timezone,
        currency: input.currency,
        dateFormat: input.dateFormat,
      },
    });
    return this.getOwn(orgId);
  }
}