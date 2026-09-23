import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, LeaveStatus } from '@prisma/client';
import { z } from 'zod';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';
import type { NotifyService } from '../../services/notifications';

// ---------------------------------------------------------------------------
// Validation schemas (whitelists — no raw body spreading)
// ---------------------------------------------------------------------------

const leaveTypeSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
  daysAllowedPerYear: z.number().int().min(0).max(365).default(12),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  carryForwardMax: z.number().int().min(0).max(365).default(0),
});

const leaveTypeUpdateSchema = leaveTypeSchema.partial();

const applyLeaveSchema = z.object({
  employeeId: z.string().min(1).optional(),
  leaveTypeId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  halfDay: z.boolean().default(false),
  reason: z.string().min(1).max(1000),
});

const approveLeaveSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.status !== 'REJECTED' || !!v.rejectionReason, {
    message: 'Rejection reason is required when rejecting a leave request',
    path: ['rejectionReason'],
  });

const allocateBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100).optional(),
  allocated: z.number().min(0).max(365).default(0),
  carriedOver: z.number().min(0).max(365).default(0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inclusive day count between two normalized dates (1 for same day). */
function dayCount(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function availableBalance(b: { allocated: number; carriedOver: number; used: number; pending: number }): number {
  return Math.max(0, b.allocated + b.carriedOver - b.used - b.pending);
}

/** True when the user may act on any employee's leave (not just their own). */
function canManageOrgLeave(request: FastifyRequest): boolean {
  return (
    request.user?.isSuperAdmin === true ||
    request.user?.permissions.has('leave.approve') === true ||
    request.user?.permissions.has('leave.manage') === true
  );
}

/**
 * Notify the employee who owns a leave request (used by approval, rejection
 * and cancellation hooks). No-op when the employee has no linked user account.
 */
async function notifyLeaveApplicant(
  app: FastifyInstance,
  orgId: string,
  employeeId: string,
  input: Parameters<NotifyService['notify']>[2],
): Promise<void> {
  const emp = await app.prisma.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true },
  });
  if (emp?.userId) {
    await app.notify.notify(orgId, [emp.userId], input);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/leave/types
  app.get('/types', {
    preHandler: [authenticate, requireAnyPermission(['leave.view', 'leave.create'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.leaveType.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    return sendSuccess(reply, items);
  });

  // POST /api/v1/leave/types
  app.post('/types', {
    preHandler: [authenticate, requirePermission('leave.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = leaveTypeSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid leave type payload', 400, parsed.error.flatten().fieldErrors);
    }
    try {
      const leaveType = await app.prisma.leaveType.create({
        data: { organizationId: orgId, ...parsed.data },
      });
      await app.audit.record({
        ...contextFromReq(request),
        action: 'leave.type_create',
        entity: 'leaveType',
        entityId: leaveType.id,
        newValue: { name: leaveType.name, code: leaveType.code },
      });
      return sendSuccess(reply, leaveType, 'Leave type created');
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return sendError(reply, 'LEAVE_TYPE_EXISTS', 'A leave type with this code already exists', 409);
      }
      throw error;
    }
  });

  // PATCH /api/v1/leave/types/:id
  app.patch('/types/:id', {
    preHandler: [authenticate, requirePermission('leave.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = leaveTypeUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid leave type payload', 400, parsed.error.flatten().fieldErrors);
    }

    try {
      const leaveType = await app.prisma.leaveType.updateMany({
        where: { id, organizationId: orgId },
        data: parsed.data,
      });
      if (leaveType.count === 0) {
        return sendError(reply, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found', 404);
      }
      const updated = await app.prisma.leaveType.findFirstOrThrow({ where: { id, organizationId: orgId } });
      await app.audit.record({
        ...contextFromReq(request),
        action: 'leave.type_update',
        entity: 'leaveType',
        entityId: id,
        newValue: parsed.data,
      });
      return sendSuccess(reply, updated, 'Leave type updated');
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return sendError(reply, 'LEAVE_TYPE_EXISTS', 'A leave type with this code already exists', 409);
      }
      throw error;
    }
  });

  // DELETE /api/v1/leave/types/:id
  app.delete('/types/:id', {
    preHandler: [authenticate, requirePermission('leave.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const leaveType = await app.prisma.leaveType.findFirst({ where: { id, organizationId: orgId } });
    if (!leaveType) {
      return sendError(reply, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found', 404);
    }

    const [requestCount, balanceCount] = await Promise.all([
      app.prisma.leaveRequest.count({ where: { leaveTypeId: id } }),
      app.prisma.leaveBalance.count({ where: { leaveTypeId: id } }),
    ]);
    if (requestCount > 0 || balanceCount > 0) {
      return sendError(reply, 'LEAVE_TYPE_IN_USE', 'Leave type is in use and cannot be deleted', 409);
    }

    await app.prisma.leaveType.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'leave.type_delete',
      entity: 'leaveType',
      entityId: id,
      newValue: { name: leaveType.name, code: leaveType.code },
    });
    return sendSuccess(reply, null, 'Leave type deleted');
  });

  // GET /api/v1/leave/requests
  // Data is scoped: users without leave.view only ever see their own requests.
  app.get('/requests', {
    preHandler: [authenticate, requireAnyPermission(['leave.view', 'leave.create'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; status?: string; employeeId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const canViewOrg = canManageOrgLeave(request);

    const where: Prisma.LeaveRequestWhereInput = { organizationId: orgId };
    if (canViewOrg) {
      if (query.status) where.status = query.status as LeaveStatus;
      if (query.employeeId) where.employeeId = query.employeeId;
    } else {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee profile missing', 400);
      }
      where.employeeId = emp.id;
      if (query.status) where.status = query.status as LeaveStatus;
    }

    const [items, total] = await Promise.all([
      app.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true } },
          leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
        },
      }),
      app.prisma.leaveRequest.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  // POST /api/v1/leave/requests
  app.post('/requests', {
    preHandler: [authenticate, requirePermission('leave.create')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = applyLeaveSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid leave application', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    // Resolve the employee. Staff may file on behalf of an employee; regular
    // employees are always scoped to their own profile.
    let employeeId = body.employeeId;
    if (employeeId && !canManageOrgLeave(request)) {
      employeeId = undefined;
    }
    if (!employeeId) {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee profile missing', 400);
      }
      employeeId = emp.id;
    } else {
      const emp = await app.prisma.employee.findFirst({ where: { id: employeeId, organizationId: orgId } });
      if (!emp) {
        return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in your organization', 400);
      }
    }

    const start = normalizeDay(body.startDate);
    const end = normalizeDay(body.endDate);
    if (end < start) {
      return sendError(reply, 'INVALID_DATES', 'End date must be on or after the start date', 400);
    }

    const leaveType = await app.prisma.leaveType.findFirst({
      where: { id: body.leaveTypeId, organizationId: orgId },
    });
    if (!leaveType) {
      return sendError(reply, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found', 400);
    }

    let totalDays = dayCount(start, end);
    if (body.halfDay) totalDays = Math.max(0.5, totalDays - 0.5);
    if (totalDays <= 0) {
      return sendError(reply, 'INVALID_DATES', 'Leave duration must be at least half a day', 400);
    }

    const balance = await app.prisma.leaveBalance.findFirst({
      where: { organizationId: orgId, employeeId, leaveTypeId: leaveType.id, year: start.getFullYear() },
    });
    if (!balance) {
      return sendError(reply, 'BALANCE_NOT_CONFIGURED', `No ${leaveType.name} balance is configured for the year ${start.getFullYear()}`, 400);
    }
    if (totalDays > availableBalance(balance)) {
      return sendError(reply, 'INSUFFICIENT_BALANCE', 'Insufficient leave balance for this request', 409, {
        available: availableBalance(balance),
        requested: totalDays,
      });
    }

    const overlapping = await app.prisma.leaveRequest.findFirst({
      where: {
        organizationId: orgId,
        employeeId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlapping) {
      return sendError(reply, 'OVERLAPPING_LEAVE', 'This employee already has a leave request overlapping these dates', 409, {
        conflictingRequestId: overlapping.id,
        conflictingStatus: overlapping.status,
      });
    }

    const autoApproved = leaveType.requiresApproval === false;
    const status: LeaveStatus = autoApproved ? LeaveStatus.APPROVED : LeaveStatus.PENDING;

    const leaveRequest = await app.prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          organizationId: orgId,
          employeeId,
          leaveTypeId: leaveType.id,
          startDate: start,
          endDate: end,
          totalDays,
          halfDay: body.halfDay,
          reason: body.reason,
          status,
          approvedBy: autoApproved ? request.user!.id : null,
        },
        include: { leaveType: true, employee: true },
      });
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: autoApproved
          ? { used: { increment: totalDays }, pending: { decrement: totalDays } }
          : { pending: { increment: totalDays } },
      });
      return created;
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'leave.apply',
      entity: 'leaveRequest',
      entityId: leaveRequest.id,
      newValue: { employeeId, leaveTypeId: leaveType.id, startDate: start.toISOString(), endDate: end.toISOString(), totalDays, status },
    });

    // Notify the applicant's direct manager, if one exists.
    const applicant = await app.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, manager: { select: { userId: true } } },
    });
    const applicantName = applicant ? `${applicant.firstName} ${applicant.lastName}`.trim() : 'An employee';
    if (applicant?.manager?.userId) {
      await app.notify.notify(orgId, [applicant.manager.userId], {
        title: 'Leave request submitted',
        message: `${applicantName} requested ${totalDays} day${totalDays === 1 ? '' : 's'} of ${leaveType.name}.`,
        type: 'INFO',
        link: '/leave',
      });
    }

    return sendSuccess(reply, leaveRequest, autoApproved ? 'Leave request auto-approved' : 'Leave request submitted for approval');
  });

  // PATCH /api/v1/leave/requests/:id/status
  app.patch('/requests/:id/status', {
    preHandler: [authenticate, requirePermission('leave.approve')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = approveLeaveSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid status update', 400, parsed.error.flatten().fieldErrors);
    }

    const existing = await app.prisma.leaveRequest.findFirst({
      where: { id, organizationId: orgId },
      include: { leaveType: true },
    });
    if (!existing) {
      return sendError(reply, 'REQUEST_NOT_FOUND', 'Leave request not found', 404);
    }
    if (existing.status !== LeaveStatus.PENDING) {
      return sendError(reply, 'ALREADY_PROCESSED', `This request has already been ${existing.status.toLowerCase()}`, 409, {
        status: existing.status,
      });
    }

    const periodYear = existing.startDate.getFullYear();
    const balance = await app.prisma.leaveBalance.findFirst({
      where: { organizationId: orgId, employeeId: existing.employeeId, leaveTypeId: existing.leaveTypeId, year: periodYear },
    });

    if (parsed.data.status === 'APPROVED') {
      if (!balance) {
        return sendError(reply, 'BALANCE_NOT_CONFIGURED', 'No leave balance is configured for this period', 400);
      }
      if (balance.used + existing.totalDays > balance.allocated + balance.carriedOver) {
        return sendError(reply, 'INSUFFICIENT_BALANCE', 'Approving this request would exceed the employee leave balance', 409, {
          allocated: balance.allocated + balance.carriedOver,
          wouldUse: balance.used + existing.totalDays,
        });
      }

      await app.prisma.$transaction([
        app.prisma.leaveRequest.update({
          where: { id },
          data: { status: LeaveStatus.APPROVED, approvedBy: request.user!.id },
        }),
        app.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: { used: { increment: existing.totalDays }, pending: { decrement: existing.totalDays } },
        }),
      ]);

      await app.audit.record({
        ...contextFromReq(request),
        action: 'leave.approve',
        entity: 'leaveRequest',
        entityId: id,
        newValue: { employeeId: existing.employeeId, totalDays: existing.totalDays },
      });
      await notifyLeaveApplicant(app, orgId, existing.employeeId, {
        title: 'Leave request approved',
        message: `Your ${existing.leaveType?.name ?? 'leave'} request was approved.`,
        type: 'SUCCESS',
        link: '/leave',
      });
      return sendSuccess(reply, null, 'Leave request approved');
    }

    // REJECTED — a rejection reason is guaranteed by the schema.
    const nextPending = balance ? Math.max(0, balance.pending - existing.totalDays) : 0;
    await app.prisma.$transaction([
      app.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.REJECTED,
          rejectionReason: parsed.data.rejectionReason,
          approvedBy: request.user!.id,
        },
      }),
      ...(balance
        ? [app.prisma.leaveBalance.update({ where: { id: balance.id }, data: { pending: nextPending } })]
        : []),
    ]);

    await app.audit.record({
      ...contextFromReq(request),
      action: 'leave.reject',
      entity: 'leaveRequest',
      entityId: id,
      newValue: { employeeId: existing.employeeId, totalDays: existing.totalDays, rejectionReason: parsed.data.rejectionReason },
    });
    await notifyLeaveApplicant(app, orgId, existing.employeeId, {
      title: 'Leave request rejected',
      message: `Your ${existing.leaveType?.name ?? 'leave'} request was rejected${parsed.data.rejectionReason ? `: ${parsed.data.rejectionReason}` : '.'}`,
      type: 'ALERT',
      link: '/leave',
    });
    return sendSuccess(reply, null, 'Leave request rejected');
  });

  // PATCH /api/v1/leave/requests/:id/cancel
  app.patch('/requests/:id/cancel', {
    preHandler: [authenticate, requireAnyPermission(['leave.view', 'leave.create'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.leaveRequest.findFirst({
      where: { id, organizationId: orgId },
      include: { leaveType: true },
    });
    if (!existing) {
      return sendError(reply, 'REQUEST_NOT_FOUND', 'Leave request not found', 404);
    }

    // Only the requesting employee or org leave staff may cancel.
    const emp = await selfEmployee(app, request);
    const isOwner = emp?.id === existing.employeeId;
    if (!isOwner && !canManageOrgLeave(request)) {
      return sendError(reply, 'FORBIDDEN', 'You can only cancel your own leave requests', 403);
    }

    if (existing.status !== LeaveStatus.PENDING) {
      return sendError(reply, 'ALREADY_PROCESSED', `Only pending requests can be cancelled (current status: ${existing.status.toLowerCase()})`, 409);
    }

    const balance = await app.prisma.leaveBalance.findFirst({
      where: { organizationId: orgId, employeeId: existing.employeeId, leaveTypeId: existing.leaveTypeId, year: existing.startDate.getFullYear() },
    });

    await app.prisma.$transaction([
      app.prisma.leaveRequest.update({
        where: { id },
        data: { status: LeaveStatus.CANCELLED },
      }),
      ...(balance
        ? [app.prisma.leaveBalance.update({ where: { id: balance.id }, data: { pending: Math.max(0, balance.pending - existing.totalDays) } })]
        : []),
    ]);

    await app.audit.record({
      ...contextFromReq(request),
      action: 'leave.cancel',
      entity: 'leaveRequest',
      entityId: id,
      newValue: { employeeId: existing.employeeId, totalDays: existing.totalDays },
    });
    await notifyLeaveApplicant(app, orgId, existing.employeeId, {
      title: 'Leave request cancelled',
      message: `Your ${existing.leaveType?.name ?? 'leave'} request was cancelled.`,
      type: 'INFO',
      link: '/leave',
    });
    return sendSuccess(reply, null, 'Leave request cancelled');
  });

  // GET /api/v1/leave/balances
  // Scoped like /requests: users without leave.view only see their own balances.
  app.get('/balances', {
    preHandler: [authenticate, requireAnyPermission(['leave.view', 'leave.create'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; year?: string; employeeId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const skip = (page - 1) * limit;
    const year = query.year ? parseInt(query.year, 10) : new Date().getFullYear();

    const canViewOrg = canManageOrgLeave(request);

    const where: Prisma.LeaveBalanceWhereInput = { organizationId: orgId, year };
    if (canViewOrg) {
      if (query.employeeId) where.employeeId = query.employeeId;
    } else {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee profile missing', 400);
      }
      where.employeeId = emp.id;
    }

    const [balances, total] = await Promise.all([
      app.prisma.leaveBalance.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: { name: 'asc' } }],
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
        },
      }),
      app.prisma.leaveBalance.count({ where }),
    ]);

    const items = balances.map((b) => ({
      id: b.id,
      employee: b.employee,
      leaveType: b.leaveType,
      year: b.year,
      allocated: b.allocated,
      used: b.used,
      pending: b.pending,
      carriedOver: b.carriedOver,
      available: availableBalance(b),
    }));

    return sendPaginated(reply, items, total, page, limit);
  });

  // POST /api/v1/leave/balances  (allocate / top-up an employee balance)
  app.post('/balances', {
    preHandler: [authenticate, requirePermission('leave.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = allocateBalanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid balance payload', 400, parsed.error.flatten().fieldErrors);
    }

    const year = parsed.data.year ?? new Date().getFullYear();
    const [employee, leaveType] = await Promise.all([
      app.prisma.employee.findFirst({ where: { id: parsed.data.employeeId, organizationId: orgId } }),
      app.prisma.leaveType.findFirst({ where: { id: parsed.data.leaveTypeId, organizationId: orgId } }),
    ]);
    if (!employee) {
      return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in your organization', 400);
    }
    if (!leaveType) {
      return sendError(reply, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found', 400);
    }

    const balance = await app.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year } },
      create: {
        organizationId: orgId,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        year,
        allocated: parsed.data.allocated,
        carriedOver: parsed.data.carriedOver,
      },
      update: {
        allocated: parsed.data.allocated,
        carriedOver: parsed.data.carriedOver,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'leave.balance_allocate',
      entity: 'leaveBalance',
      entityId: balance.id,
      newValue: { employeeId: employee.id, leaveTypeId: leaveType.id, year, allocated: parsed.data.allocated, carriedOver: parsed.data.carriedOver },
    });
    return sendSuccess(reply, balance, 'Leave balance updated');
  });
}

/** Resolve the signed-in user's own employee profile, scoped to the request org. */
async function selfEmployee(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{ id: string } | null> {
  return app.prisma.employee.findFirst({
    where: { userId: request.user!.id, organizationId: request.user!.organizationId },
    select: { id: true },
  });
}