import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, resolveOrgScope } from '../../middleware/guard';

const listAuditSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  entity: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  userId: z.string().cuid().optional(),
  organizationId: z.string().cuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

async function listAuditLogs(request: FastifyRequest, reply: FastifyReply) {
  const q = (request.query ?? {}) as Record<string, unknown>;
  const parsed = listAuditSchema.parse(q);
  const orgId = resolveOrgScope(request, parsed.organizationId);

  const where = {
    organizationId: orgId,
    ...(parsed.entity ? { entity: parsed.entity } : {}),
    ...(parsed.action ? { action: parsed.action } : {}),
    ...(parsed.userId ? { userId: parsed.userId } : {}),
    ...(parsed.from || parsed.to
      ? {
          createdAt: {
            ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
            ...(parsed.to ? { lte: new Date(parsed.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await request.server.prisma.$transaction([
    request.server.prisma.auditLog.findMany({
      where,
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
    request.server.prisma.auditLog.count({ where }),
  ]);

  return sendSuccess(reply, {
    items: items.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      oldValue: l.oldValue,
      newValue: l.newValue,
      metadata: l.metadata,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      user: l.user
        ? { id: l.user.id, name: `${l.user.firstName} ${l.user.lastName}`, email: l.user.email }
        : null,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
    totalPages: Math.ceil(total / parsed.pageSize),
  });
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    preHandler: [authenticate, requirePermission('audit.view')],
  }, listAuditLogs);
}