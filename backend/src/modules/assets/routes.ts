import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED'] as const;

const assetBodySchema = z.object({
  name: z.string().min(1).max(160),
  assetTag: z.string().min(1).max(40),
  category: z.string().max(80).optional(),
  serialNumber: z.string().max(120).optional().nullable(),
  status: z.enum(ASSET_STATUSES).optional(),
});

const assetUpdateSchema = assetBodySchema.partial();

const assetStatusSchema = z.object({ status: z.enum(ASSET_STATUSES) });

const assignSchema = z.object({ employeeId: z.string().min(1) });

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    preHandler: [authenticate, requirePermission('assets.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.asset.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.get('/:id', {
    preHandler: [authenticate, requirePermission('assets.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const asset = await app.prisma.asset.findFirst({
      where: { id, organizationId: orgId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true, email: true } },
      },
    });
    if (!asset) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);
    return sendSuccess(reply, asset);
  });

  app.post('/', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = assetBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid asset payload', 400, parsed.error.flatten().fieldErrors);
    }
    const assetTag = parsed.data.assetTag.toUpperCase();
    const dup = await app.prisma.asset.findFirst({ where: { organizationId: orgId, assetTag } });
    if (dup) return sendError(reply, 'ASSET_EXISTS', `An asset with tag ${assetTag} already exists`, 409);

    const asset = await app.prisma.asset.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        assetTag,
        category: parsed.data.category ?? 'LAPTOP',
        serialNumber: parsed.data.serialNumber ?? null,
        status: parsed.data.status ?? 'AVAILABLE',
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_create',
      entity: 'asset',
      entityId: asset.id,
      oldValue: null,
      newValue: { name: asset.name, assetTag: asset.assetTag, status: asset.status },
    });
    return sendSuccess(reply, asset, 'Asset added successfully');
  });

  app.patch('/:id', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = assetUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid asset payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.asset.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);

    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.assetTag === 'string') {
      data.assetTag = (data.assetTag as string).toUpperCase();
      if (data.assetTag !== existing.assetTag) {
        const dup = await app.prisma.asset.findFirst({ where: { organizationId: orgId, assetTag: data.assetTag as string } });
        if (dup) return sendError(reply, 'ASSET_EXISTS', `An asset with tag ${data.assetTag} already exists`, 409);
      }
    }
    if (parsed.data.status && existing.status === 'ASSIGNED' && parsed.data.status !== 'ASSIGNED') {
      return sendError(reply, 'ASSET_ASSIGNED', 'Assigned assets cannot change status directly; use return first', 409);
    }

    const asset = await app.prisma.asset.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_update',
      entity: 'asset',
      entityId: asset.id,
      oldValue: { name: existing.name, status: existing.status },
      newValue: { name: asset.name, status: asset.status },
    });
    return sendSuccess(reply, asset, 'Asset updated successfully');
  });

  app.delete('/:id', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const asset = await app.prisma.asset.findFirst({ where: { id, organizationId: orgId } });
    if (!asset) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);
    if (asset.status === 'ASSIGNED') {
      return sendError(reply, 'ASSET_ASSIGNED', 'Assigned assets cannot be deleted; return the asset first', 409);
    }
    await app.prisma.asset.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_delete',
      entity: 'asset',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Asset deleted successfully');
  });

  // --- Assignment lifecycle ---
  app.post('/:id/assign', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid assignment payload', 400, parsed.error.flatten().fieldErrors);
    }
    const asset = await app.prisma.asset.findFirst({ where: { id, organizationId: orgId } });
    if (!asset) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);
    if (asset.status !== 'AVAILABLE') {
      return sendError(reply, 'ASSET_NOT_AVAILABLE', `Asset is ${asset.status} and cannot be assigned`, 409);
    }
    const employee = await app.prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, organizationId: orgId },
      include: { user: { select: { id: true } } },
    });
    if (!employee) return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in this organization', 400);

    const updated = await app.prisma.asset.update({
      where: { id: asset.id },
      data: { assignedToId: employee.id, assignedAt: new Date(), status: 'ASSIGNED' },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_assign',
      entity: 'asset',
      entityId: asset.id,
      oldValue: { status: asset.status, assignedToId: null },
      newValue: { status: 'ASSIGNED', assignedToId: employee.id, assignedAt: updated.assignedAt?.toISOString() },
    });
    if (employee.userId) {
      await app.notify.notify(orgId, [employee.userId], {
        title: 'Asset assigned',
        message: `${asset.name} (${asset.assetTag}) has been assigned to you.`,
        type: 'SUCCESS',
        link: '/assets',
      });
    }
    return sendSuccess(reply, updated, `Asset assigned to ${employee.firstName} ${employee.lastName}`);
  });

  app.post('/:id/return', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const asset = await app.prisma.asset.findFirst({
      where: { id, organizationId: orgId },
      include: { assignedTo: { include: { user: { select: { id: true } } } } },
    });
    if (!asset) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);
    if (asset.status !== 'ASSIGNED' || !asset.assignedToId) {
      return sendError(reply, 'ASSET_NOT_ASSIGNED', 'Asset is not assigned to anyone', 409);
    }

    const updated = await app.prisma.asset.update({
      where: { id: asset.id },
      data: { assignedToId: null, assignedAt: null, status: 'AVAILABLE' },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_return',
      entity: 'asset',
      entityId: asset.id,
      oldValue: { status: 'ASSIGNED', assignedToId: asset.assignedToId },
      newValue: { status: 'AVAILABLE', assignedToId: null },
    });
    if (asset.assignedTo?.userId) {
      await app.notify.notify(orgId, [asset.assignedTo.userId], {
        title: 'Asset returned',
        message: `${asset.name} (${asset.assetTag}) has been returned.`,
        type: 'INFO',
        link: '/assets',
      });
    }
    return sendSuccess(reply, updated, 'Asset returned and marked available');
  });

  // --- Status transitions (maintenance / retired) ---
  app.post('/:id/status', {
    preHandler: [authenticate, requirePermission('assets.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = assetStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid status payload', 400, parsed.error.flatten().fieldErrors);
    }
    const asset = await app.prisma.asset.findFirst({ where: { id, organizationId: orgId } });
    if (!asset) return sendError(reply, 'ASSET_NOT_FOUND', 'Asset not found', 404);
    if (asset.status === 'ASSIGNED' && parsed.data.status !== 'ASSIGNED') {
      return sendError(reply, 'ASSET_ASSIGNED', 'Assigned assets must be returned before changing status', 409);
    }
    if (asset.status === 'RETIRED' && parsed.data.status !== 'RETIRED') {
      return sendError(reply, 'ASSET_RETIRED', 'Retired assets cannot be reactivated', 409);
    }

    const updated = await app.prisma.asset.update({ where: { id: asset.id }, data: { status: parsed.data.status } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'assets.asset_status',
      entity: 'asset',
      entityId: asset.id,
      oldValue: { status: asset.status },
      newValue: { status: updated.status },
    });
    return sendSuccess(reply, updated, `Asset marked as ${updated.status}`);
  });
}