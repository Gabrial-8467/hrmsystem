import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, PerformanceStatus, PerformanceGoalStatus, PerformanceReviewStatus } from '@prisma/client';
import { z } from 'zod';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

// ---------------------------------------------------------------------------
// Validation schemas (whitelists — no raw body spreading)
// ---------------------------------------------------------------------------

const rating = z
  .number()
  .min(0)
  .max(5)
  .refine((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-6, {
    message: 'Rating must be a multiple of 0.5 between 0 and 5',
  });

const cycleCreateSchema = z
  .object({
    title: z.string().min(1).max(120),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'Cycle end date must be after the start date',
    path: ['endDate'],
  });

const cycleStatusSchema = z.object({
  status: z.nativeEnum(PerformanceStatus),
});

const goalCreateSchema = z.object({
  employeeId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(40).default('INDIVIDUAL'),
  targetValue: z.number().min(0.01).max(1_000_000).default(100),
  currentValue: z.number().min(0).max(1_000_000).default(0),
  unit: z.string().max(10).default('%'),
  dueDate: z.coerce.date(),
});

const goalUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
    category: z.string().max(40).optional(),
    targetValue: z.number().min(0.01).max(1_000_000).optional(),
    currentValue: z.number().min(0).max(1_000_000).optional(),
    unit: z.string().max(10).optional(),
    dueDate: z.coerce.date().optional(),
    status: z.nativeEnum(PerformanceGoalStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const reviewCreateSchema = z.object({
  cycleId: z.string().min(1),
  employeeId: z.string().min(1).optional(),
  selfRating: rating.optional(),
  selfFeedback: z.string().max(2000).optional(),
  managerRating: rating.optional(),
  managerFeedback: z.string().max(2000).optional(),
});

const selfSubmitSchema = z
  .object({
    selfRating: rating.optional(),
    selfFeedback: z.string().max(2000).nullable().optional(),
    submit: z.boolean().default(false),
  })
  .refine((v) => v.selfRating !== undefined || v.selfFeedback !== undefined, {
    message: 'Provide a self rating and/or self feedback',
  });

const managerSubmitSchema = z.object({
  managerRating: rating,
  managerFeedback: z.string().max(2000).nullable().optional(),
  finalRating: rating,
});

// ---------------------------------------------------------------------------
// Lifecycle maps (forward-only state machines)
// ---------------------------------------------------------------------------

const CYCLE_TRANSITIONS: Record<PerformanceStatus, PerformanceStatus[]> = {
  [PerformanceStatus.DRAFT]: [PerformanceStatus.ACTIVE],
  [PerformanceStatus.ACTIVE]: [PerformanceStatus.COMPLETED],
  [PerformanceStatus.COMPLETED]: [],
};

const GOAL_TRANSITIONS: Record<PerformanceGoalStatus, PerformanceGoalStatus[]> = {
  [PerformanceGoalStatus.NOT_STARTED]: [PerformanceGoalStatus.IN_PROGRESS, PerformanceGoalStatus.CANCELLED],
  [PerformanceGoalStatus.IN_PROGRESS]: [PerformanceGoalStatus.COMPLETED, PerformanceGoalStatus.ON_HOLD, PerformanceGoalStatus.CANCELLED],
  [PerformanceGoalStatus.ON_HOLD]: [PerformanceGoalStatus.IN_PROGRESS, PerformanceGoalStatus.CANCELLED],
  [PerformanceGoalStatus.COMPLETED]: [],
  [PerformanceGoalStatus.CANCELLED]: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callerEmployee(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{ id: string } | null> {
  return app.prisma.employee.findFirst({
    where: { userId: request.user!.id, organizationId: request.user!.organizationId },
    select: { id: true },
  });
}

/** True when the user may view org-wide performance data (not just their own). */
function canViewOrgPerformance(request: FastifyRequest): boolean {
  return (
    request.user?.isSuperAdmin === true ||
    request.user?.permissions.has('performance.view') === true
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function paginate(query: unknown): { page: number; limit: number; skip: number } {
  const q = query as { page?: string; limit?: string };
  const page = Math.max(1, parseInt(q.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20', 10)));
  return { page, limit, skip: (page - 1) * limit };
}

async function notifyReviewer(
  app: FastifyInstance,
  orgId: string,
  review: { reviewer?: { userId: string | null } | null; employee?: { firstName: string; lastName: string } | null },
  message: string,
): Promise<void> {
  if (!review.reviewer?.userId) return;
  await app.notify.notify(orgId, [review.reviewer.userId], {
    title: 'Self-assessment submitted',
    message,
    type: 'INFO',
    link: '/performance',
  });
}

export async function performanceRoutes(app: FastifyInstance): Promise<void> {

  // -------------------------------------------------------------------------
  // Cycles
  // -------------------------------------------------------------------------

  app.get('/cycles', {
    preHandler: [authenticate, requirePermission('performance.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { page, limit, skip } = paginate(request.query);

    const [items, total] = await Promise.all([
      app.prisma.performanceCycle.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { reviews: true } } },
      }),
      app.prisma.performanceCycle.count({ where: { organizationId: orgId } }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  app.post('/cycles', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = cycleCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid cycle payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const cycle = await app.prisma.performanceCycle.create({
      data: {
        organizationId: orgId,
        title: parsed.data.title,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        status: PerformanceStatus.DRAFT,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.cycle_create',
      entity: 'performanceCycle',
      entityId: cycle.id,
      newValue: { title: cycle.title, startDate: cycle.startDate.toISOString(), endDate: cycle.endDate.toISOString() },
    });

    return sendSuccess(reply, cycle, 'Performance cycle created');
  });

  app.patch('/cycles/:id/status', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = cycleStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid cycle status payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = await app.prisma.performanceCycle.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'CYCLE_NOT_FOUND', 'Performance cycle not found', 404);
    }

    const allowed = CYCLE_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return sendError(reply, 'INVALID_TRANSITION', `Cannot move this cycle from ${existing.status} to ${parsed.data.status}`, 409);
    }

    const cycle = await app.prisma.performanceCycle.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.cycle_status',
      entity: 'performanceCycle',
      entityId: id,
      newValue: { from: existing.status, to: parsed.data.status },
    });

    return sendSuccess(reply, cycle, `Cycle is now ${parsed.data.status}`);
  });

  app.delete('/cycles/:id', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.performanceCycle.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'CYCLE_NOT_FOUND', 'Performance cycle not found', 404);
    }
    if (existing.status !== PerformanceStatus.DRAFT) {
      return sendError(reply, 'CYCLE_NOT_DRAFT', 'Only draft cycles can be deleted', 409);
    }

    await app.prisma.performanceCycle.delete({ where: { id } });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.cycle_delete',
      entity: 'performanceCycle',
      entityId: id,
      newValue: { title: existing.title },
    });

    return sendSuccess(reply, null, 'Performance cycle deleted');
  });

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  app.get('/goals', {
    preHandler: [authenticate, requirePermission('performance.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { employeeId?: string };
    const { page, limit, skip } = paginate(request.query);

    const where: any = { organizationId: orgId };
    if (query.employeeId) where.employeeId = query.employeeId;

    const [items, total] = await Promise.all([
      app.prisma.performanceGoal.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      app.prisma.performanceGoal.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  app.post('/goals', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = goalCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid goal payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const employee = await app.prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, organizationId: orgId },
      select: { id: true },
    });
    if (!employee) {
      return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in this organization', 404);
    }

    const goal = await app.prisma.performanceGoal.create({
      data: {
        organizationId: orgId,
        employeeId: employee.id,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        targetValue: parsed.data.targetValue,
        currentValue: parsed.data.currentValue,
        unit: parsed.data.unit,
        dueDate: parsed.data.dueDate,
        status: PerformanceGoalStatus.IN_PROGRESS,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.goal_create',
      entity: 'performanceGoal',
      entityId: goal.id,
      newValue: { employeeId: goal.employeeId, title: goal.title, targetValue: goal.targetValue },
    });

    return sendSuccess(reply, goal, 'Goal created');
  });

  app.patch('/goals/:id', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = goalUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid goal payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = await app.prisma.performanceGoal.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'GOAL_NOT_FOUND', 'Performance goal not found', 404);
    }

    if (parsed.data.status && parsed.data.status !== existing.status) {
      const allowed = GOAL_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return sendError(reply, 'INVALID_TRANSITION', `Cannot move this goal from ${existing.status} to ${parsed.data.status}`, 409);
      }
    }

    const goal = await app.prisma.performanceGoal.update({
      where: { id },
      data: parsed.data,
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.goal_update',
      entity: 'performanceGoal',
      entityId: id,
      newValue: {
        title: goal.title,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        status: goal.status,
      },
    });

    return sendSuccess(reply, goal, 'Goal updated');
  });

  app.delete('/goals/:id', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.performanceGoal.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'GOAL_NOT_FOUND', 'Performance goal not found', 404);
    }

    await app.prisma.performanceGoal.delete({ where: { id } });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.goal_delete',
      entity: 'performanceGoal',
      entityId: id,
      newValue: { title: existing.title },
    });

    return sendSuccess(reply, null, 'Goal deleted');
  });

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  app.get('/reviews', {
    preHandler: [authenticate, requireAnyPermission(['performance.view', 'performance.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { cycleId?: string; reviewerId?: string; status?: string };
    const { page, limit, skip } = paginate(request.query);

    const where: any = { organizationId: orgId };
    if (query.cycleId) where.cycleId = query.cycleId;
    if (query.reviewerId) where.reviewerId = query.reviewerId;
    if (query.status) where.status = query.status;

    // Self-service users are scoped to their own reviews only.
    if (!canViewOrgPerformance(request)) {
      const emp = await callerEmployee(app, request);
      if (!emp) {
        return sendPaginated(reply, [], 0, page, limit);
      }
      where.employeeId = emp.id;
    }

    const [items, total] = await Promise.all([
      app.prisma.performanceReview.findMany({
        where,
        orderBy: [{ cycle: { endDate: 'desc' } }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          cycle: { select: { id: true, title: true, startDate: true, endDate: true, status: true } },
        },
      }),
      app.prisma.performanceReview.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  app.get('/reviews/:id', {
    preHandler: [authenticate, requireAnyPermission(['performance.view', 'performance.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const review = await app.prisma.performanceReview.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, title: true, startDate: true, endDate: true, status: true } },
      },
    });
    if (!review) {
      return sendError(reply, 'REVIEW_NOT_FOUND', 'Performance review not found', 404);
    }

    // Self-service users may only read their own reviews (404 hides existence).
    const emp = await callerEmployee(app, request);
    if (!canViewOrgPerformance(request) && emp?.id !== review.employeeId) {
      return sendError(reply, 'REVIEW_NOT_FOUND', 'Performance review not found', 404);
    }

    return sendSuccess(reply, review);
  });

  app.post('/reviews', {
    preHandler: [authenticate, requireAnyPermission(['performance.self', 'performance.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = reviewCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid review payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const cycle = await app.prisma.performanceCycle.findFirst({
      where: { id: parsed.data.cycleId, organizationId: orgId },
    });
    if (!cycle) {
      return sendError(reply, 'CYCLE_NOT_FOUND', 'Performance cycle not found', 404);
    }
    if (cycle.status === PerformanceStatus.COMPLETED) {
      return sendError(reply, 'CYCLE_COMPLETED', 'Reviews can no longer be created for a completed cycle', 409);
    }

    const emp = await callerEmployee(app, request);
    const canManage = request.user!.isSuperAdmin || request.user!.permissions.has('performance.manage');

    let employeeId = parsed.data.employeeId ?? '';
    let reviewerId: string | null = null;

    if (canManage) {
      const target = await app.prisma.employee.findFirst({
        where: { id: employeeId, organizationId: orgId },
        select: { id: true, managerId: true },
      });
      if (!target) {
        return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in this organization', 404);
      }
      employeeId = target.id;
      reviewerId = target.managerId ?? (emp?.id ?? null);
    } else {
      // Self-service: employees may only open a review for themselves (the
      // employeeId is optional and defaults to the caller).
      const targetId = parsed.data.employeeId ?? emp?.id ?? '';
      if (!emp || emp.id !== targetId) {
        return sendError(reply, 'FORBIDDEN', 'You can only create a review for yourself', 403);
      }
      if (cycle.status !== PerformanceStatus.ACTIVE) {
        return sendError(reply, 'CYCLE_INACTIVE', 'Self assessments are only open on active cycles', 409);
      }
      employeeId = emp.id;
      reviewerId = null;
    }

    let review;
    try {
      review = await app.prisma.performanceReview.create({
        data: {
          organizationId: orgId,
          cycleId: cycle.id,
          employeeId,
          reviewerId,
          selfRating: parsed.data.selfRating,
          selfFeedback: parsed.data.selfFeedback,
          managerRating: parsed.data.managerRating,
          managerFeedback: parsed.data.managerFeedback,
          status: PerformanceReviewStatus.DRAFT,
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return sendError(reply, 'REVIEW_EXISTS', 'This employee already has a review for this cycle', 409);
      }
      throw error;
    }

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.review_create',
      entity: 'performanceReview',
      entityId: review.id,
      newValue: { cycleId: cycle.id, employeeId, reviewerId },
    });

    return sendSuccess(reply, review, 'Performance review created');
  });

  app.patch('/reviews/:id/self', {
    preHandler: [authenticate, requireAnyPermission(['performance.self', 'performance.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = selfSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid self-assessment payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = await app.prisma.performanceReview.findFirst({
      where: { id, organizationId: orgId },
      include: {
        reviewer: { select: { userId: true, firstName: true, lastName: true } },
        employee: { select: { firstName: true, lastName: true } },
        cycle: { select: { status: true } },
      },
    });
    if (!existing) {
      return sendError(reply, 'REVIEW_NOT_FOUND', 'Performance review not found', 404);
    }

    const emp = await callerEmployee(app, request);
    if (!emp || emp.id !== existing.employeeId) {
      return sendError(reply, 'FORBIDDEN', 'You can only complete your own self-assessment', 403);
    }
    if (existing.cycle.status !== PerformanceStatus.ACTIVE) {
      return sendError(reply, 'CYCLE_INACTIVE', 'Self assessments are only open on active cycles', 409);
    }
    if (existing.status === PerformanceReviewStatus.APPROVED) {
      return sendError(reply, 'ALREADY_APPROVED', 'This review is approved and locked', 409);
    }

    const submitting = parsed.data.submit || existing.status === PerformanceReviewStatus.SUBMITTED;
    const review = await app.prisma.performanceReview.update({
      where: { id },
      data: {
        selfRating: parsed.data.selfRating ?? existing.selfRating,
        selfFeedback: parsed.data.selfFeedback !== undefined ? parsed.data.selfFeedback : existing.selfFeedback,
        status: submitting ? PerformanceReviewStatus.SUBMITTED : PerformanceReviewStatus.DRAFT,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: submitting ? 'performance.review_self_submit' : 'performance.review_self_update',
      entity: 'performanceReview',
      entityId: id,
      newValue: { selfRating: review.selfRating ?? null, status: review.status },
    });

    if (submitting) {
      await notifyReviewer(app, orgId, existing, `${existing.employee?.firstName ?? 'An employee'} submitted their self-assessment for review.`);
    }

    return sendSuccess(reply, review, submitting ? 'Self-assessment submitted' : 'Self-assessment saved');
  });

  app.patch('/reviews/:id/manager', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = managerSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid manager review payload', 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = await app.prisma.performanceReview.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: { select: { userId: true, firstName: true, lastName: true } },
        cycle: { select: { title: true, status: true } },
      },
    });
    if (!existing) {
      return sendError(reply, 'REVIEW_NOT_FOUND', 'Performance review not found', 404);
    }
    if (existing.cycle.status === PerformanceStatus.COMPLETED) {
      return sendError(reply, 'CYCLE_COMPLETED', 'The review cycle is closed', 409);
    }
    if (existing.status === PerformanceReviewStatus.APPROVED) {
      return sendError(reply, 'ALREADY_APPROVED', 'This review is already approved', 409);
    }

    const review = await app.prisma.performanceReview.update({
      where: { id },
      data: {
        managerRating: parsed.data.managerRating,
        managerFeedback: parsed.data.managerFeedback,
        finalRating: parsed.data.finalRating,
        status: PerformanceReviewStatus.APPROVED,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.review_approve',
      entity: 'performanceReview',
      entityId: id,
      newValue: { managerRating: review.managerRating, finalRating: review.finalRating, status: review.status },
    });

    if (existing.employee.userId) {
      await app.notify.notify(orgId, [existing.employee.userId], {
        title: 'Performance review finalized',
        message: `Your performance review for ${existing.cycle.title} has been approved by your reviewer.`,
        type: 'SUCCESS',
        link: '/performance',
      });
    }

    return sendSuccess(reply, review, 'Performance review approved');
  });

  app.delete('/reviews/:id', {
    preHandler: [authenticate, requirePermission('performance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.performanceReview.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'REVIEW_NOT_FOUND', 'Performance review not found', 404);
    }
    if (existing.status === PerformanceReviewStatus.APPROVED) {
      return sendError(reply, 'ALREADY_APPROVED', 'Approved reviews cannot be deleted', 409);
    }

    await app.prisma.performanceReview.delete({ where: { id } });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'performance.review_delete',
      entity: 'performanceReview',
      entityId: id,
      newValue: { cycleId: existing.cycleId, employeeId: existing.employeeId },
    });

    return sendSuccess(reply, null, 'Performance review deleted');
  });
}