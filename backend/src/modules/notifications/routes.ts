import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/notifications
  app.get('/', {
    preHandler: [authenticate, requirePermission('notifications.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; filter?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = { userId, organizationId: orgId };
    if (query.filter === 'unread') where.isRead = false;

    const [items, total, unread] = await Promise.all([
      app.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.notification.count({ where }),
      app.prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return sendSuccess(reply, { items, meta: { total, page, limit, pages: Math.ceil(total / limit) }, unread });
  });

  // GET /api/v1/notifications/unread-count
  app.get('/unread-count', {
    preHandler: [authenticate, requirePermission('notifications.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const orgId = request.user!.organizationId;
    const unread = await app.prisma.notification.count({
      where: { userId, organizationId: orgId, isRead: false },
    });

    return sendSuccess(reply, { unread });
  });

  // PATCH /api/v1/notifications/:id/read
  app.patch('/:id/read', {
    preHandler: [authenticate, requirePermission('notifications.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const notification = await app.prisma.notification.findFirst({
      where: { id, userId, organizationId: orgId },
    });
    if (!notification) {
      return sendError(reply, 'NOT_FOUND', 'Notification not found', 404);
    }

    // Idempotent — already-read notifications are updated but return success.
    const updated = await app.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return sendSuccess(reply, updated);
  });

  // POST /api/v1/notifications/read-all
  app.post('/read-all', {
    preHandler: [authenticate, requirePermission('notifications.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const orgId = request.user!.organizationId;

    const result = await app.prisma.notification.updateMany({
      where: { userId, organizationId: orgId, isRead: false },
      data: { isRead: true },
    });

    return sendSuccess(reply, { updated: result.count }, 'All notifications marked as read');
  });
}