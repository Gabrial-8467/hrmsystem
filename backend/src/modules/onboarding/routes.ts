import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, OnboardingStatus, OnboardingTaskStatus } from '@prisma/client';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const templateTaskSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(0).max(500).optional(),
  order: z.number().int().min(0).default(0),
  dueInDays: z.number().int().min(0).max(365).default(7),
  optional: z.boolean().default(false),
});

const templateCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(0).max(500).optional(),
  isDefault: z.boolean().default(false),
  tasks: z.array(templateTaskSchema).min(1, 'A template requires at least one task').max(30),
});

const templateUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().min(0).max(500).nullable().optional(),
    isDefault: z.boolean().optional(),
    tasks: z.array(templateTaskSchema).min(1).max(30).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const assignmentCreateSchema = z.object({
  employeeId: z.string().min(1),
  templateId: z.string().min(1),
});

const taskUpdateSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function selfEmployee(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{ id: string } | null> {
  return app.prisma.employee.findFirst({
    where: { userId: request.user!.id, organizationId: request.user!.organizationId },
    select: { id: true, userId: true },
  });
}

function canViewOrg(request: FastifyRequest): boolean {
  return (
    request.user?.isSuperAdmin === true ||
    request.user?.permissions.has('onboarding.view') === true ||
    request.user?.permissions.has('onboarding.manage') === true
  );
}

function computeProgress(tasks: Array<{ status: OnboardingTaskStatus }>): { completed: number; total: number; percent: number } {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === OnboardingTaskStatus.COMPLETED).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

const ASSIGNMENT_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  template: { select: { id: true, name: true, description: true } },
  tasks: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      title: true,
      description: true,
      order: true,
      status: true,
      completedAt: true,
      completedBy: true,
    },
  },
} as const;

type AssignmentWithTasks = Prisma.OnboardingAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

function serializeAssignment(assignment: AssignmentWithTasks): Record<string, unknown> {
  const progress = computeProgress(assignment.tasks);
  const remaining = assignment.tasks.filter((t) => t.status !== OnboardingTaskStatus.COMPLETED).length;
  return {
    id: assignment.id,
    status: assignment.status,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    employee: assignment.employee,
    template: assignment.template,
    progress,
    tasks: assignment.tasks,
    remainingTasks: remaining,
  };
}

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/onboarding/templates
  app.get('/templates', {
    preHandler: [authenticate, requireAnyPermission(['onboarding.view', 'onboarding.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.onboardingTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { assignments: true } },
        tasks: { orderBy: { order: 'asc' }, select: { id: true, title: true, order: true, dueInDays: true, optional: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  // POST /api/v1/onboarding/templates
  app.post('/templates', {
    preHandler: [authenticate, requirePermission('onboarding.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = templateCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid template payload', 400, parsed.error.flatten().fieldErrors);
    }
    const { tasks, ...rest } = parsed.data;

    const template = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.onboardingTemplate.findUnique({
        where: { organizationId_name: { organizationId: orgId, name: rest.name } },
      });
      if (existing) throw new Error('ONBOARDING_TEMPLATE_EXISTS');

      if (rest.isDefault) {
        await tx.onboardingTemplate.updateMany({ where: { organizationId: orgId }, data: { isDefault: false } });
      }
      return tx.onboardingTemplate.create({
        data: {
          organizationId: orgId,
          name: rest.name,
          description: rest.description,
          isDefault: rest.isDefault,
          tasks: {
            create: tasks.map((t) => ({
              title: t.title,
              description: t.description,
              order: t.order,
              dueInDays: t.dueInDays,
              optional: t.optional,
            })),
          },
        },
      });
    }).catch((err: Error) => {
      if (err.message === 'ONBOARDING_TEMPLATE_EXISTS') {
        return { code: 'ONBOARDING_TEMPLATE_EXISTS' as const };
      }
      return { code: 'DATABASE_ERROR' as const, cause: err };
    });

    if ('code' in template && template.code === 'ONBOARDING_TEMPLATE_EXISTS') {
      return sendError(reply, 'ONBOARDING_TEMPLATE_EXISTS', 'A template with this name already exists', 409);
    }
    if ('code' in template) {
      throw template.cause;
    }

    await app.audit.record({
      ...contextFromReq(request),
      action: 'onboarding.template_create',
      entity: 'onboardingTemplate',
      entityId: template.id,
      newValue: { name: rest.name, taskCount: tasks.length },
    });

    return sendSuccess(reply, template, 'Template created');
  });

  // PATCH /api/v1/onboarding/templates/:id
  app.patch('/templates/:id', {
    preHandler: [authenticate, requirePermission('onboarding.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = templateUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid template payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const existing = await app.prisma.onboardingTemplate.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) return sendError(reply, 'TEMPLATE_NOT_FOUND', 'Template not found', 404);

    const updated = await app.prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.onboardingTemplate.updateMany({ where: { organizationId: orgId }, data: { isDefault: false } });
      }
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.isDefault !== undefined) patch.isDefault = body.isDefault;
      if (body.tasks) {
        await tx.onboardingTemplateTask.deleteMany({ where: { templateId: id } });
        await tx.onboardingTemplateTask.createMany({
          data: body.tasks.map((t, index) => ({
            templateId: id,
            title: t.title,
            description: t.description,
            order: t.order ?? index,
            dueInDays: t.dueInDays,
            optional: t.optional,
          })),
        });
      }
      if (Object.keys(patch).length === 0) {
        return tx.onboardingTemplate.findUniqueOrThrow({
          where: { id },
          include: { tasks: { orderBy: { order: 'asc' } } },
        });
      }
      return tx.onboardingTemplate.update({
        where: { id },
        data: patch,
        include: { tasks: { orderBy: { order: 'asc' } } },
      });
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'onboarding.template_update',
      entity: 'onboardingTemplate',
      entityId: id,
      newValue: { name: updated.name, taskCount: updated.tasks.length },
    });

    return sendSuccess(reply, updated, 'Template updated');
  });

  // DELETE /api/v1/onboarding/templates/:id
  app.delete('/templates/:id', {
    preHandler: [authenticate, requirePermission('onboarding.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.onboardingTemplate.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!existing) return sendError(reply, 'TEMPLATE_NOT_FOUND', 'Template not found', 404);
    if (existing._count.assignments > 0) {
      return sendError(reply, 'TEMPLATE_IN_USE', 'Templates that have been assigned cannot be deleted', 409, {
        assignments: existing._count.assignments,
      });
    }

    await app.prisma.onboardingTemplate.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'onboarding.template_delete',
      entity: 'onboardingTemplate',
      entityId: id,
      newValue: { name: existing.name },
    });

    return sendSuccess(reply, null, 'Template deleted');
  });

  // GET /api/v1/onboarding/assignments
  app.get('/assignments', {
    preHandler: [authenticate, requireAnyPermission(['onboarding.view', 'onboarding.self', 'onboarding.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { status?: string; employeeId?: string };

    const where: Record<string, unknown> = { organizationId: orgId };
    if (!canViewOrg(request)) {
      const emp = await selfEmployee(app, request);
      if (!emp) return sendSuccess(reply, []);
      where.employeeId = emp.id;
    } else {
      if (query.employeeId) where.employeeId = query.employeeId;
    }
    if (query.status) where.status = query.status;

    const items = await app.prisma.onboardingAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: ASSIGNMENT_INCLUDE,
    });

    return sendSuccess(reply, items.map((a) => serializeAssignment(a)));
  });

  // GET /api/v1/onboarding/assignments/:id
  app.get('/assignments/:id', {
    preHandler: [authenticate, requireAnyPermission(['onboarding.view', 'onboarding.self', 'onboarding.manage'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const assignment = await app.prisma.onboardingAssignment.findFirst({
      where: { id, organizationId: orgId },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) return sendError(reply, 'ASSIGNMENT_NOT_FOUND', 'Onboarding assignment not found', 404);

    if (!canViewOrg(request)) {
      const emp = await selfEmployee(app, request);
      if (!emp || assignment.employeeId !== emp.id) {
        return sendError(reply, 'ASSIGNMENT_ACCESS_DENIED', 'You can only view your own onboarding', 403);
      }
    }

    return sendSuccess(reply, serializeAssignment(assignment));
  });

  // POST /api/v1/onboarding/assignments
  app.post('/assignments', {
    preHandler: [authenticate, requirePermission('onboarding.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = assignmentCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid assignment payload', 400, parsed.error.flatten().fieldErrors);
    }
    const { employeeId, templateId } = parsed.data;

    const employee = await app.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
      include: { user: { select: { id: true } } },
    });
    if (!employee) return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee does not belong to this organization', 400);

    const template = await app.prisma.onboardingTemplate.findFirst({
      where: { id: templateId, organizationId: orgId },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
    if (!template) return sendError(reply, 'TEMPLATE_NOT_FOUND', 'Template not found', 400);
    if (template.tasks.length === 0) {
      return sendError(reply, 'TEMPLATE_NO_TASKS', 'Template has no tasks configured', 400);
    }

    const active = await app.prisma.onboardingAssignment.findFirst({
      where: {
        organizationId: orgId,
        employeeId,
        status: { in: [OnboardingStatus.NOT_STARTED, OnboardingStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (active) {
      return sendError(reply, 'ONBOARDING_ACTIVE_EXISTS', 'Employee already has an active onboarding assignment', 409);
    }

    const assignment = await app.prisma.onboardingAssignment.create({
      data: {
        organizationId: orgId,
        employeeId,
        templateId,
        createdBy: request.user!.id,
        tasks: {
          create: template.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            order: t.order,
            status: OnboardingTaskStatus.PENDING,
          })),
        },
      },
      include: ASSIGNMENT_INCLUDE,
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'onboarding.assign',
      entity: 'onboardingAssignment',
      entityId: assignment.id,
      newValue: { employeeId, template: template.name, taskCount: template.tasks.length },
    });

    if (employee.user?.id) {
      await app.notify.notify(orgId, [employee.user.id], {
        title: 'Onboarding started',
        message: `Your onboarding "${template.name}" has started with ${template.tasks.length} tasks to complete.`,
        type: 'INFO',
        link: '/onboarding',
      });
    }

    return sendSuccess(reply, serializeAssignment(assignment), 'Onboarding assigned');
  });

  // PATCH /api/v1/onboarding/assignments/:id/tasks/:taskId
  app.patch('/assignments/:id/tasks/:taskId', {
    preHandler: [authenticate, requireAnyPermission(['onboarding.manage', 'onboarding.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id, taskId } = request.params as { id: string; taskId: string };
    const parsed = taskUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid task payload', 400, parsed.error.flatten().fieldErrors);
    }
    const status = parsed.data.status as OnboardingTaskStatus;
    const isManager = request.user!.permissions.has('onboarding.manage');

    const assignment = await app.prisma.onboardingAssignment.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: { select: { id: true, userId: true } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    if (!assignment) return sendError(reply, 'ASSIGNMENT_NOT_FOUND', 'Onboarding assignment not found', 404);

    if (!isManager) {
      const emp = await selfEmployee(app, request);
      if (!emp || assignment.employeeId !== emp.id) {
        return sendError(reply, 'ASSIGNMENT_ACCESS_DENIED', 'You can only update your own onboarding tasks', 403);
      }
    }
    if (assignment.status === OnboardingStatus.COMPLETED) {
      return sendError(reply, 'ONBOARDING_COMPLETED', 'Completed onboarding cannot be modified', 409, {
        status: assignment.status,
      });
    }

    const task = assignment.tasks.find((t) => t.id === taskId);
    if (!task) return sendError(reply, 'TASK_NOT_FOUND', 'Onboarding task not found', 404);

    const completedBy = status === OnboardingTaskStatus.COMPLETED ? request.user!.id : null;
    const [updatedAssignment] = await app.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.update({
        where: { id: taskId },
        data: {
          status,
          completedAt: status === OnboardingTaskStatus.COMPLETED ? new Date() : null,
          completedBy,
        },
      });
      const tasks = assignment.tasks.map((t) =>
        (t.id === taskId ? { status } : t));
      const allDone = tasks.every((t) => t.status === OnboardingTaskStatus.COMPLETED);
      const started = assignment.status === OnboardingStatus.NOT_STARTED;
      const completed = allDone;
      const updatedAssignment = await tx.onboardingAssignment.update({
        where: { id },
        data: {
          ...(started ? { status: OnboardingStatus.IN_PROGRESS, startedAt: new Date() } : {}),
          ...(completed ? { status: OnboardingStatus.COMPLETED, completedAt: new Date() } : {}),
        },
        include: ASSIGNMENT_INCLUDE,
      });
      return [updatedAssignment] as const;
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'onboarding.task_update',
      entity: 'onboardingTask',
      entityId: taskId,
      newValue: { assignmentId: id, task: task.title, from: task.status, to: status },
    });

    if (updatedAssignment.status === OnboardingStatus.COMPLETED) {
      if (assignment.employee.userId) {
        await app.notify.notify(orgId, [assignment.employee.userId], {
          title: 'Onboarding complete',
          message: `Congratulations! Your onboarding "${updatedAssignment.template.name}" is complete.`,
          type: 'SUCCESS',
          link: '/onboarding',
        });
      }
    }

    return sendSuccess(reply, serializeAssignment(updatedAssignment), 'Task updated');
  });
}