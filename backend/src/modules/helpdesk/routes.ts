import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

const ticketBodySchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(3).max(5000),
  category: z.enum(['IT', 'COMPLAINT', 'HR', 'PAYROLL', 'ADMIN', 'OTHER']).default('OTHER'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  employeeId: z.string().min(1).optional(),
});

const ticketUpdateSchema = z
  .object({
    category: z.enum(['IT', 'COMPLAINT', 'HR', 'PAYROLL', 'ADMIN', 'OTHER']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const commentBodySchema = z.object({
  body: z.string().min(1).max(2000),
});

async function resolveEmployee(app: FastifyInstance, orgId: string, userId: string) {
  return app.prisma.employee.findFirst({ where: { userId, organizationId: orgId } });
}

const TICKET_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  _count: { select: { comments: true } },
} as const;

export async function helpdeskRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/helpdesk/tickets
  app.get('/tickets', {
    preHandler: [authenticate, requireAnyPermission(['helpdesk.ticket.view', 'helpdesk.ticket.create', 'helpdesk.ticket.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { status?: string; own?: string };
    const canManage = request.user!.permissions.has('helpdesk.ticket.manage');
    const caller = await resolveEmployee(app, orgId, request.user!.id);

    const where: Record<string, unknown> = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (!canManage || query.own === 'true') {
      if (!caller) return sendSuccess(reply, []);
      where.employeeId = caller.id;
    }

    const items = await app.prisma.helpdeskTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: TICKET_INCLUDE,
    });
    return sendSuccess(reply, items);
  });

  // GET /api/v1/helpdesk/tickets/:id
  app.get('/tickets/:id', {
    preHandler: [authenticate, requireAnyPermission(['helpdesk.ticket.view', 'helpdesk.ticket.create', 'helpdesk.ticket.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const canManage = request.user!.permissions.has('helpdesk.ticket.manage');
    const caller = await resolveEmployee(app, orgId, request.user!.id);

    const ticket = await app.prisma.helpdeskTicket.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        },
      },
    });
    if (!ticket) return sendError(reply, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
    if (!canManage && (!caller || ticket.employeeId !== caller.id)) {
      return sendError(reply, 'TICKET_ACCESS_DENIED', 'You can only view your own tickets', 403);
    }
    return sendSuccess(reply, ticket);
  });

  // POST /api/v1/helpdesk/tickets
  app.post('/tickets', {
    preHandler: [authenticate, requireAnyPermission(['helpdesk.ticket.create', 'helpdesk.ticket.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = ticketBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid ticket payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;
    const canManage = request.user!.permissions.has('helpdesk.ticket.manage');

    let employeeId = body.employeeId;
    if (!employeeId) {
      const caller = await resolveEmployee(app, orgId, request.user!.id);
      if (!caller) return sendError(reply, 'EMPLOYEE_PROFILE_REQUIRED', 'No employee profile is linked to this account', 400);
      employeeId = caller.id;
    } else if (!canManage) {
      return sendError(reply, 'SELF_ONLY', 'Tickets can only be created for your own employee profile', 400);
    }

    if (!canManage) {
      const caller = await resolveEmployee(app, orgId, request.user!.id);
      if (!caller || employeeId !== caller.id) {
        return sendError(reply, 'SELF_ONLY', 'Tickets can only be created for your own employee profile', 400);
      }
    }

    const employee = await app.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
      select: { id: true },
    });
    if (!employee) return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee does not belong to this organization', 400);

    const ticket = await app.prisma.helpdeskTicket.create({
      data: {
        organizationId: orgId,
        employeeId,
        subject: body.subject,
        description: body.description,
        category: body.category,
        priority: body.priority,
      },
      include: TICKET_INCLUDE,
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'helpdesk.ticket_create',
      entity: 'helpdeskTicket',
      entityId: ticket.id,
      newValue: { employeeId, category: ticket.category, priority: ticket.priority },
    });

    return sendSuccess(reply, ticket, 'Ticket created');
  });

  // PATCH /api/v1/helpdesk/tickets/:id
  app.patch('/tickets/:id', {
    preHandler: [authenticate, requirePermission('helpdesk.ticket.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = ticketUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid ticket update', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const existing = await app.prisma.helpdeskTicket.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: { select: { id: true, userId: true } },
        assignee: { select: { id: true, userId: true } },
      },
    });
    if (!existing) return sendError(reply, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
    if (existing.status === 'CLOSED' && body.status && body.status !== 'CLOSED') {
      return sendError(reply, 'TICKET_CLOSED', 'Closed tickets cannot be reopened', 409, { status: existing.status });
    }

    const data: Record<string, unknown> = {};
    if (body.category) data.category = body.category;
    if (body.priority) data.priority = body.priority;
    if (body.status) data.status = body.status;
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null) {
        data.assigneeId = null;
      } else {
        const assignee = await app.prisma.employee.findFirst({
          where: { id: body.assigneeId, organizationId: orgId },
          select: { id: true, userId: true },
        });
        if (!assignee) return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Assignee does not belong to this organization', 400);
        data.assigneeId = assignee.id;
        if (assignee.id !== existing.assigneeId && assignee.userId) {
          await app.notify.notify(orgId, [assignee.userId], {
            title: 'Helpdesk ticket assigned',
            message: `Ticket "${existing.subject}" has been assigned to you.`,
            type: 'ACTION',
            link: '/helpdesk',
          });
        }
      }
    }

    const updated = await app.prisma.helpdeskTicket.update({ where: { id }, data, include: TICKET_INCLUDE });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'helpdesk.ticket_update',
      entity: 'helpdeskTicket',
      entityId: id,
      newValue: {
        from: { status: existing.status, category: existing.category, priority: existing.priority, assigneeId: existing.assigneeId },
        to: { status: updated.status, category: updated.category, priority: updated.priority, assigneeId: updated.assigneeId },
      },
    });

    if (updated.status === 'RESOLVED' && existing.status !== 'RESOLVED' && existing.employee.userId) {
      await app.notify.notify(orgId, [existing.employee.userId], {
        title: 'Helpdesk ticket resolved',
        message: `Your ticket "${existing.subject}" has been marked as resolved.`,
        type: 'SUCCESS',
        link: '/helpdesk',
      });
    }

    return sendSuccess(reply, updated, 'Ticket updated');
  });

  // POST /api/v1/helpdesk/tickets/:id/comments
  app.post('/tickets/:id/comments', {
    preHandler: [authenticate, requireAnyPermission(['helpdesk.ticket.create', 'helpdesk.ticket.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = commentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid comment payload', 400, parsed.error.flatten().fieldErrors);
    }

    const caller = await resolveEmployee(app, orgId, request.user!.id);
    if (!caller) return sendError(reply, 'EMPLOYEE_PROFILE_REQUIRED', 'No employee profile is linked to this account', 400);

    const ticket = await app.prisma.helpdeskTicket.findFirst({
      where: { id, organizationId: orgId },
      include: { employee: { select: { id: true, userId: true } }, assignee: { select: { id: true, userId: true } } },
    });
    if (!ticket) return sendError(reply, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
    if (ticket.status === 'CLOSED') {
      return sendError(reply, 'TICKET_CLOSED', 'Closed tickets cannot accept comments', 409, { status: ticket.status });
    }
    if (!request.user!.permissions.has('helpdesk.ticket.manage') && ticket.employeeId !== caller.id) {
      return sendError(reply, 'TICKET_ACCESS_DENIED', 'You can only comment on your own tickets', 403);
    }

    const comment = await app.prisma.helpdeskComment.create({
      data: {
        organizationId: orgId,
        ticketId: id,
        authorId: caller.id,
        body: parsed.data.body,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'helpdesk.ticket_comment',
      entity: 'helpdeskComment',
      entityId: comment.id,
      newValue: { ticketId: id, ticket: ticket.subject },
    });

    if (comment.authorId === ticket.employeeId) {
      if (ticket.assignee?.userId) {
        await app.notify.notify(orgId, [ticket.assignee.userId], {
          title: 'New reply on assigned ticket',
          message: `"${ticket.subject}" received a new comment.`,
          type: 'ACTION',
          link: '/helpdesk',
        });
      }
    } else if (ticket.employee.userId) {
      await app.notify.notify(orgId, [ticket.employee.userId], {
        title: 'Update on your helpdesk ticket',
        message: `Your ticket "${ticket.subject}" received a new comment.`,
        type: 'INFO',
        link: '/helpdesk',
      });
    }

    return sendSuccess(reply, comment, 'Comment added');
  });
}