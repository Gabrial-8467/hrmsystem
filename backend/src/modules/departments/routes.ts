import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

const createDepartmentSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  description: z.string().max(500).optional().nullable(),
  managerId: z.string().optional().nullable(),
  parentDepartmentId: z.string().optional().nullable(),
});

const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  timezone: z.string().max(60).optional(),
});

export async function departmentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/departments
  app.get('/', {
    preHandler: [authenticate, requirePermission('departments.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.department.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true, designations: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return sendSuccess(reply, items);
  });

  // POST /api/v1/departments
  app.post('/', {
    preHandler: [authenticate, requirePermission('departments.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = createDepartmentSchema.parse(request.body);

    // Referenced manager/parent department must belong to this org.
    if (body.managerId) {
      const belongs = await app.prisma.employee.count({ where: { id: body.managerId, organizationId: orgId } });
      if (!belongs) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_REFERENCE', message: 'manager does not belong to this organization' } });
      }
    }
    if (body.parentDepartmentId) {
      const belongs = await app.prisma.department.count({ where: { id: body.parentDepartmentId, organizationId: orgId } });
      if (!belongs) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_REFERENCE', message: 'parent department does not belong to this organization' } });
      }
    }

    const dept = await app.prisma.department.create({
      data: {
        organizationId: orgId,
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        managerId: body.managerId ?? null,
        parentDepartmentId: body.parentDepartmentId ?? null,
      },
    });

    return sendSuccess(reply, dept, 'Department created successfully');
  });
}

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/branches
  app.get('/', {
    preHandler: [authenticate, requirePermission('branches.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.branch.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
      },
    });

    return sendSuccess(reply, items);
  });

  // POST /api/v1/branches
  app.post('/', {
    preHandler: [authenticate, requirePermission('branches.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = createBranchSchema.parse(request.body);

    const branch = await app.prisma.branch.create({
      data: {
        organizationId: orgId,
        name: body.name,
        code: body.code,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        country: body.country ?? null,
        zipCode: body.zipCode ?? null,
        timezone: body.timezone ?? undefined,
      },
    });

    return sendSuccess(reply, branch, 'Branch created successfully');
  });
}
