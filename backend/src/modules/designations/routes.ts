import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

const designationBodySchema = z.object({
  title: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  departmentId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  level: z.number().int().min(1).max(20).default(1),
});

const designationUpdateSchema = designationBodySchema.partial();

export async function designationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    preHandler: [authenticate, requirePermission('designations.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.designation.findMany({
      where: { organizationId: orgId },
      orderBy: { level: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.post('/', {
    preHandler: [authenticate, requirePermission('designations.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = designationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid designation payload', 400, parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.departmentId) {
      const dept = await app.prisma.department.findFirst({
        where: { id: parsed.data.departmentId, organizationId: orgId },
      });
      if (!dept) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }

    const code = parsed.data.code.toUpperCase();
    const dup = await app.prisma.designation.findFirst({ where: { organizationId: orgId, code } });
    if (dup) return sendError(reply, 'DESIGNATION_EXISTS', `A designation with code ${code} already exists`, 409);

    const designation = await app.prisma.designation.create({
      data: {
        organizationId: orgId,
        title: parsed.data.title,
        code,
        departmentId: parsed.data.departmentId ?? null,
        description: parsed.data.description ?? null,
        level: parsed.data.level,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'designations.designation_create',
      entity: 'designation',
      entityId: designation.id,
      newValue: { title: designation.title, code: designation.code, level: designation.level },
    });
    return sendSuccess(reply, designation, 'Designation created successfully');
  });

  app.patch('/:id', {
    preHandler: [authenticate, requirePermission('designations.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = designationUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid designation payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.designation.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'DESIGNATION_NOT_FOUND', 'Designation not found', 404);

    if (parsed.data.departmentId) {
      const dept = await app.prisma.department.findFirst({
        where: { id: parsed.data.departmentId, organizationId: orgId },
      });
      if (!dept) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.code === 'string') {
      data.code = (data.code as string).toUpperCase();
      if (data.code !== existing.code) {
        const dup = await app.prisma.designation.findFirst({ where: { organizationId: orgId, code: data.code as string } });
        if (dup) return sendError(reply, 'DESIGNATION_EXISTS', `A designation with code ${data.code} already exists`, 409);
      }
    }

    const designation = await app.prisma.designation.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'designations.designation_update',
      entity: 'designation',
      entityId: designation.id,
      newValue: { title: designation.title, code: designation.code, level: designation.level },
    });
    return sendSuccess(reply, designation, 'Designation updated successfully');
  });

  app.delete('/:id', {
    preHandler: [authenticate, requirePermission('designations.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const designation = await app.prisma.designation.findFirst({ where: { id, organizationId: orgId } });
    if (!designation) return sendError(reply, 'DESIGNATION_NOT_FOUND', 'Designation not found', 404);

    const assigned = await app.prisma.employee.count({ where: { designationId: id, organizationId: orgId } });
    if (assigned > 0) {
      return sendError(reply, 'DESIGNATION_IN_USE', 'Designation is assigned to employees and cannot be deleted', 409);
    }

    await app.prisma.designation.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'designations.designation_delete',
      entity: 'designation',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Designation deleted successfully');
  });
}