import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requireAnyPermission, requirePermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

const EXPENSE_CATEGORIES = ['TRAVEL', 'OFFICE', 'MEALS', 'EQUIPMENT', 'SOFTWARE', 'TRAINING', 'OTHER'] as const;

const expenseBodySchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  currency: z.string().max(3).default('USD'),
  date: z.coerce.date(),
  merchant: z.string().max(120).optional(),
  description: z.string().min(1).max(500),
  employeeId: z.string().optional(),
});

const announcementBodySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(8000),
  targetAudience: z.enum(['ALL', 'DEPARTMENT']).optional(),
  targetDepartmentId: z.string().optional().nullable(),
  publishedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});

const announcementUpdateSchema = announcementBodySchema.partial();

interface ExpenseTransition {
  from: readonly ExpenseStatus[];
  to: ExpenseStatus;
  audit: string;
  notifyTitle: string;
  notifyType: 'INFO' | 'SUCCESS' | 'ALERT' | 'ACTION';
}

const EXPENSE_TRANSITIONS: Record<'approve' | 'reject' | 'pay', ExpenseTransition> = {
  approve: {
    from: [ExpenseStatus.DRAFT, ExpenseStatus.SUBMITTED],
    to: ExpenseStatus.APPROVED,
    audit: 'operations.expense_approve',
    notifyTitle: 'Expense approved',
    notifyType: 'SUCCESS',
  },
  reject: {
    from: [ExpenseStatus.DRAFT, ExpenseStatus.SUBMITTED],
    to: ExpenseStatus.REJECTED,
    audit: 'operations.expense_reject',
    notifyTitle: 'Expense rejected',
    notifyType: 'ALERT',
  },
  pay: {
    from: [ExpenseStatus.APPROVED],
    to: ExpenseStatus.PAID,
    audit: 'operations.expense_pay',
    notifyTitle: 'Expense reimbursed',
    notifyType: 'INFO',
  },
};

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  function expenseTransitionHandler(action: keyof typeof EXPENSE_TRANSITIONS) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
      const orgId = request.user!.organizationId;
      const { id } = request.params as { id: string };
      const cfg = EXPENSE_TRANSITIONS[action];

      const expense = await app.prisma.expense.findFirst({
        where: { id, organizationId: orgId },
        include: { employee: { select: { id: true, userId: true } } },
      });
      if (!expense) {
        return sendError(reply, 'EXPENSE_NOT_FOUND', 'Expense not found', 404);
      }
      if (!cfg.from.includes(expense.status)) {
        return sendError(reply, 'EXPENSE_INVALID_STATUS', `Expense in status ${expense.status} cannot be ${action}d`, 409);
      }

      if (action !== 'pay') {
        const actor = await app.prisma.employee.findFirst({
          where: { userId: request.user!.id, organizationId: orgId },
          select: { id: true },
        });
        if (actor && expense.employeeId === actor.id) {
          return sendError(reply, 'SELF_APPROVAL', 'You cannot approve or reject your own expense', 409);
        }
      }

      const updated = await app.prisma.expense.update({
        where: { id: expense.id },
        data: {
          status: cfg.to,
          approvedBy: action === 'pay' ? expense.approvedBy : request.user!.id,
        },
      });

      await app.audit.record({
        ...contextFromReq(request),
        action: cfg.audit,
        entity: 'expense',
        entityId: updated.id,
        newValue: { from: expense.status, to: updated.status, amount: updated.amount },
      });

      if (expense.employee.userId) {
        const verb = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'paid out';
        await app.notify.notify(orgId, [expense.employee.userId], {
          title: cfg.notifyTitle,
          message: `Your ${updated.category} expense of ${updated.currency} ${updated.amount.toFixed(2)} has been ${verb}.`,
          type: cfg.notifyType,
          link: '/expenses',
        });
      }

      return sendSuccess(reply, updated, `Expense ${action}d successfully`);
    };
  }

  // --- Assets ---
  app.get('/assets', {
    preHandler: [authenticate, requirePermission('assets.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.asset.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    });
    return sendSuccess(reply, items);
  });

  // --- Expenses ---
  app.get('/expenses', {
    preHandler: [authenticate, requireAnyPermission(['expenses.view', 'expenses.create'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const canViewAll = request.user!.isSuperAdmin || request.user!.permissions.has('expenses.view');

    const where: Prisma.ExpenseWhereInput = { organizationId: orgId };
    if (!canViewAll) {
      const self = await app.prisma.employee.findFirst({
        where: { userId: request.user!.id, organizationId: orgId },
        select: { id: true },
      });
      where.employeeId = self?.id ?? '__no_employee__';
    }

    const items = await app.prisma.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    });
    return sendSuccess(reply, items);
  });

  app.post('/expenses', {
    preHandler: [authenticate, requirePermission('expenses.create')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = expenseBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid expense payload', 400, parsed.error.flatten().fieldErrors);
    }
    const { employeeId, ...data } = parsed.data;

    let empId = employeeId;
    if (!empId) {
      const self = await app.prisma.employee.findFirst({
        where: { userId: request.user!.id, organizationId: orgId },
        select: { id: true },
      });
      empId = self?.id;
    }
    if (!empId) {
      return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'No matching employee record found for this expense', 400);
    }

    const emp = await app.prisma.employee.findFirst({
      where: { id: empId, organizationId: orgId },
      select: { id: true },
    });
    if (!emp) {
      return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee does not belong to this organization', 400);
    }

    const exp = await app.prisma.expense.create({
      data: {
        organizationId: orgId,
        employeeId: empId,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        date: data.date,
        description: data.description,
        merchant: data.merchant ?? null,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'operations.expense_create',
      entity: 'expense',
      entityId: exp.id,
      newValue: { category: exp.category, amount: exp.amount, currency: exp.currency, date: exp.date.toISOString() },
    });

    return sendSuccess(reply, exp, 'Expense submitted successfully');
  });

  app.patch('/expenses/:id/approve', {
    preHandler: [authenticate, requirePermission('expenses.approve')],
  }, expenseTransitionHandler('approve'));

  app.patch('/expenses/:id/reject', {
    preHandler: [authenticate, requirePermission('expenses.approve')],
  }, expenseTransitionHandler('reject'));

  app.patch('/expenses/:id/pay', {
    preHandler: [authenticate, requirePermission('expenses.pay')],
  }, expenseTransitionHandler('pay'));

  // --- Announcements ---
  app.get('/announcements', {
    preHandler: [authenticate, requirePermission('announcements.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.announcement.findMany({
      where: { organizationId: orgId },
      orderBy: { publishedAt: 'desc' },
      include: {
        targetDepartment: { select: { id: true, name: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.post('/announcements', {
    preHandler: [authenticate, requirePermission('announcements.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = announcementBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid announcement payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const publishedAt = body.publishedAt ?? new Date();
    if (body.targetDepartmentId) {
      const dept = await app.prisma.department.findFirst({
        where: { id: body.targetDepartmentId, organizationId: orgId },
      });
      if (!dept) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }
    if (body.expiresAt && body.expiresAt < publishedAt) {
      return sendError(reply, 'INVALID_REQUEST', 'expiresAt must be after publishedAt', 400);
    }

    const audience = body.targetDepartmentId ? 'DEPARTMENT' : (body.targetAudience ?? 'ALL');
    const announcement = await app.prisma.announcement.create({
      data: {
        organizationId: orgId,
        title: body.title,
        content: body.content,
        targetDepartmentId: body.targetDepartmentId ?? null,
        targetAudience: audience,
        publishedAt,
        expiresAt: body.expiresAt ?? null,
        authorId: request.user!.id,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'announcements.announcement_create',
      entity: 'announcement',
      entityId: announcement.id,
      oldValue: null,
      newValue: { title: announcement.title, audience: announcement.targetAudience },
    });
    return sendSuccess(reply, announcement, 'Announcement published');
  });

  app.patch('/announcements/:id', {
    preHandler: [authenticate, requirePermission('announcements.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = announcementUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid announcement payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.announcement.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found', 404);

    if (parsed.data.targetDepartmentId) {
      const dept = await app.prisma.department.findFirst({
        where: { id: parsed.data.targetDepartmentId, organizationId: orgId },
      });
      if (!dept) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (data.targetDepartmentId || Object.prototype.hasOwnProperty.call(parsed.data, 'targetDepartmentId')) {
      const deptId = (parsed.data.targetDepartmentId as string | null | undefined) ?? null;
      if (deptId) data.targetAudience = 'DEPARTMENT';
      else if (parsed.data.targetAudience) data.targetAudience = parsed.data.targetAudience;
    }
    if (data.expiresAt && existing.publishedAt && (data.expiresAt as Date) < existing.publishedAt) {
      return sendError(reply, 'INVALID_REQUEST', 'expiresAt must be after publishedAt', 400);
    }

    const announcement = await app.prisma.announcement.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'announcements.announcement_update',
      entity: 'announcement',
      entityId: announcement.id,
      oldValue: { title: existing.title },
      newValue: { title: announcement.title, audience: announcement.targetAudience },
    });
    return sendSuccess(reply, announcement, 'Announcement updated');
  });

  app.delete('/announcements/:id', {
    preHandler: [authenticate, requirePermission('announcements.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const announcement = await app.prisma.announcement.findFirst({ where: { id, organizationId: orgId } });
    if (!announcement) return sendError(reply, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found', 404);
    await app.prisma.announcement.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'announcements.announcement_delete',
      entity: 'announcement',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Announcement deleted successfully');
  });

  // --- Notifications ---
  app.get('/notifications', {
    preHandler: [authenticate, requirePermission('notifications.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await app.prisma.notification.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return sendSuccess(reply, items);
  });
}
