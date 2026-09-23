import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, PayrollStatus, PayslipStatus, EmployeeStatus } from '@prisma/client';
import { z } from 'zod';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission, assertCan } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';
import { renderPayslipPdf, type PayslipPdfData } from './pdf';

// ---------------------------------------------------------------------------
// Validation schemas (whitelists — no raw body spreading)
// ---------------------------------------------------------------------------

const runSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const runStatusSchema = z.object({
  status: z.enum(['DRAFT', 'CALCULATED', 'REVIEWED', 'APPROVED', 'PROCESSED', 'PAID']),
});

const componentSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
  type: z.enum(['EARNING', 'DEDUCTION']).default('EARNING'),
  calculationType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  calculationValue: z.number().min(0).max(1000).default(0),
  isTaxable: z.boolean().default(true),
  isRecurring: z.boolean().default(true),
});

const componentUpdateSchema = componentSchema.partial();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  DRAFT: [PayrollStatus.CALCULATED],
  CALCULATED: [PayrollStatus.REVIEWED],
  REVIEWED: [PayrollStatus.APPROVED],
  APPROVED: [PayrollStatus.PROCESSED],
  PROCESSED: [PayrollStatus.PAID],
  PAID: [],
};

/** Transitions beyond initial calculation require an explicit approval. */
const APPROVAL_TRANSITIONS: PayrollStatus[] = [
  PayrollStatus.REVIEWED,
  PayrollStatus.APPROVED,
  PayrollStatus.PROCESSED,
  PayrollStatus.PAID,
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function selfEmployee(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{ id: string } | null> {
  return app.prisma.employee.findFirst({
    where: { userId: request.user!.id, organizationId: request.user!.organizationId },
    select: { id: true },
  });
}

/** True when the user may view org-wide payroll data (not just their own payslips). */
function canViewOrgPayroll(request: FastifyRequest): boolean {
  return (
    request.user?.isSuperAdmin === true ||
    request.user?.permissions.has('payslips.view') === true ||
    request.user?.permissions.has('payroll.view') === true
  );
}

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/payroll/runs
  app.get('/runs', {
    preHandler: [authenticate, requirePermission('payroll.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.payrollRun.findMany({
      where: { organizationId: orgId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        _count: { select: { payslips: true } },
      },
    });

    return sendSuccess(reply, items);
  });

  // GET /api/v1/payroll/payslips
  app.get('/payslips', {
    preHandler: [authenticate, requireAnyPermission(['payslips.view', 'payslips.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; payrollRunId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };
    if (query.payrollRunId) where.payrollRunId = query.payrollRunId;

    // Self-service users are scoped to their own payslips only.
    if (!canViewOrgPayroll(request)) {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendPaginated(reply, [], 0, page, limit);
      }
      where.employeeId = emp.id;
    }

    const [items, total] = await Promise.all([
      app.prisma.payslip.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
          payrollRun: { select: { month: true, year: true } },
        },
      }),
      app.prisma.payslip.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  // GET /api/v1/payroll/payslips/:id
  app.get('/payslips/:id', {
    preHandler: [authenticate, requireAnyPermission(['payslips.view', 'payslips.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const where: any = { id, organizationId: orgId };
    if (!canViewOrgPayroll(request)) {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendError(reply, 'NOT_FOUND', 'Payslip record not found', 404);
      }
      where.employeeId = emp.id;
    }

    const payslip = await app.prisma.payslip.findFirst({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeCode: true,
            bankName: true,
            accountNumber: true,
            taxId: true,
            joiningDate: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
          },
        },
        payrollRun: { select: { month: true, year: true, startDate: true, endDate: true } },
      },
    });

    if (!payslip) {
      return sendError(reply, 'NOT_FOUND', 'Payslip record not found', 404);
    }

    return sendSuccess(reply, payslip);
  });

  // GET /api/v1/payroll/payslips/:id/pdf
  app.get('/payslips/:id/pdf', {
    preHandler: [authenticate, requireAnyPermission(['payslips.view', 'payslips.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const where: any = { id, organizationId: orgId };
    if (!canViewOrgPayroll(request)) {
      const emp = await selfEmployee(app, request);
      if (!emp) {
        return sendError(reply, 'NOT_FOUND', 'Payslip record not found', 404);
      }
      where.employeeId = emp.id;
    }

    const payslip = await app.prisma.payslip.findFirst({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeCode: true,
            bankName: true,
            accountNumber: true,
            taxId: true,
            joiningDate: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
          },
        },
        payrollRun: { select: { month: true, year: true, startDate: true, endDate: true } },
      },
    });
    if (!payslip) {
      return sendError(reply, 'NOT_FOUND', 'Payslip record not found', 404);
    }

    const org = await app.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, currency: true, address: true, email: true, phone: true, website: true, timezone: true },
    });
    if (!org) {
      return sendError(reply, 'NOT_FOUND', 'Organization not found', 404);
    }

    const buffer = await renderPayslipPdf(
      { payslip: payslip as unknown as PayslipPdfData['payslip'], org },
      org.timezone,
    );

    const period = `${payslip.payrollRun.month}-${payslip.payrollRun.year}`;
    reply.type('application/pdf');
    reply.header('Content-Disposition', `inline; filename="payslip-${payslip.employee.employeeCode}-${period}.pdf"`);
    return reply.send(buffer);
  });

  // POST /api/v1/payroll/runs
  app.post('/runs', {
    preHandler: [authenticate, requirePermission('payroll.process')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;

    const parsed = runSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid payroll run payload', 400, parsed.error.flatten().fieldErrors);
    }
    const { month, year } = parsed.data;

    const existing = await app.prisma.payrollRun.findUnique({
      where: { organizationId_month_year: { organizationId: orgId, month, year } },
    });
    if (existing) {
      return sendError(reply, 'PAYROLL_RUN_EXISTS', `Payroll for ${MONTH_NAMES[month - 1]} ${year} has already been processed`, 409);
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Latest salary record per active employee effective before the period end.
    const salaries = await app.prisma.employeeSalary.findMany({
      where: {
        organizationId: orgId,
        effectiveDate: { lte: endDate },
        employee: { status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE] } },
      },
      orderBy: { effectiveDate: 'desc' },
      distinct: ['employeeId'],
    });

    // Resolve the tax percentage from the org's income tax component.
    const taxComponent = await app.prisma.salaryComponent.findFirst({
      where: { organizationId: orgId, type: 'DEDUCTION', code: 'TAX' },
    });
    const taxPercent =
      taxComponent?.calculationType === 'PERCENTAGE' && taxComponent.calculationValue > 0
        ? taxComponent.calculationValue
        : 0;

    const payslipData = salaries.map((s) => {
      const basic = s.basicSalary;
      const allowances = s.allowances;
      const deductions = s.deductions;
      const gross = basic + allowances;
      const taxDeducted = taxPercent > 0 ? Math.round((gross * taxPercent) / 100) : 0;
      return {
        organizationId: orgId,
        employeeId: s.employeeId,
        basicSalary: basic,
        allowances,
        deductions,
        taxDeducted,
        netPay: gross - deductions - taxDeducted,
      };
    });

    if (payslipData.length === 0) {
      return sendError(reply, 'NO_SALARIES', 'No active employees have salary records for this period', 400);
    }

    const totalGross = payslipData.reduce((sum, p) => sum + p.basicSalary + p.allowances, 0);
    const totalDeductions = payslipData.reduce((sum, p) => sum + p.deductions, 0);
    const totalNet = payslipData.reduce((sum, p) => sum + p.netPay, 0);

    const run = await app.prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          organizationId: orgId,
          month,
          year,
          startDate,
          endDate,
          status: PayrollStatus.CALCULATED,
          totalGross,
          totalDeductions,
          totalNet,
          processedBy: request.user!.id,
        },
      });
      await tx.payslip.createMany({
        data: payslipData.map((p) => ({ ...p, payrollRunId: created.id, status: PayslipStatus.GENERATED })),
      });
      return created;
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'payroll.process',
      entity: 'payrollRun',
      entityId: run.id,
      newValue: { month, year, employeeCount: payslipData.length, totalGross, totalDeductions, totalNet },
    });

    // Notify every employee included in this payroll run that their payslip is ready.
    const recipients = await app.prisma.employee.findMany({
      where: { id: { in: payslipData.map((p) => p.employeeId) }, userId: { not: null } },
      select: { userId: true },
    });
    await app.notify.notify(orgId, recipients.map((e) => e.userId as string), {
      title: 'Payslip available',
      message: `Your payslip for ${MONTH_NAMES[month - 1]} ${year} is ready to view.`,
      type: 'INFO',
      link: '/payroll/payslips',
    });

    return sendSuccess(reply, run, 'Payroll run calculated and created');
  });

  // PATCH /api/v1/payroll/runs/:id/status
  app.patch('/runs/:id/status', {
    preHandler: [authenticate, requireAnyPermission(['payroll.process', 'payroll.approve'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const parsed = runStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid status payload', 400, parsed.error.flatten().fieldErrors);
    }
    const { status } = parsed.data;

    const run = await app.prisma.payrollRun.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!run) {
      return sendError(reply, 'NOT_FOUND', 'Payroll run not found', 404);
    }

    const allowed = ALLOWED_TRANSITIONS[run.status];
    if (!allowed.includes(status)) {
      return sendError(reply, 'INVALID_TRANSITION', `Cannot transition a ${run.status} run to ${status}`, 409, {
        from: run.status,
        to: status,
      });
    }

    // Approving transitions require the payroll.approve permission.
    const target = status as PayrollStatus;
    if (APPROVAL_TRANSITIONS.includes(target)) {
      assertCan(request, 'payroll.approve');
    }

    const finalize = status === PayrollStatus.PAID;

    const updated = await app.prisma.$transaction(async (tx) => {
      const updatedRun = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: target,
          approvedBy: APPROVAL_TRANSITIONS.includes(target) ? request.user!.id : run.approvedBy,
        },
      });
      if (finalize) {
        await tx.payslip.updateMany({
          where: { payrollRunId: run.id },
          data: { status: PayslipStatus.PAID, paymentDate: new Date() },
        });
      }
      return updatedRun;
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: APPROVAL_TRANSITIONS.includes(target) ? 'payroll.approve' : 'payroll.process',
      entity: 'payrollRun',
      entityId: run.id,
      newValue: { from: run.status, to: target },
    });

    return sendSuccess(reply, updated, finalize ? 'Payroll finalized and marked as paid' : `Payroll moved to ${target}`);
  });

  // GET /api/v1/payroll/salary/components
  app.get('/salary/components', {
    preHandler: [authenticate, requirePermission('salary.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.salaryComponent.findMany({
      where: { organizationId: orgId },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });

    return sendSuccess(reply, items);
  });

  // POST /api/v1/payroll/salary/components
  app.post('/salary/components', {
    preHandler: [authenticate, requirePermission('salary.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;

    const parsed = componentSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid salary component payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    try {
      const component = await app.prisma.salaryComponent.create({
        data: { organizationId: orgId, ...body },
      });

      await app.audit.record({
        ...contextFromReq(request),
        action: 'salary.component_create',
        entity: 'salaryComponent',
        entityId: component.id,
        newValue: { code: component.code, type: component.type, calculationType: component.calculationType },
      });

      return sendSuccess(reply, component, 'Salary component created');
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return sendError(reply, 'COMPONENT_EXISTS', `A salary component with code ${body.code} already exists`, 409);
      }
      throw error;
    }
  });

  // PATCH /api/v1/payroll/salary/components/:id
  app.patch('/salary/components/:id', {
    preHandler: [authenticate, requirePermission('salary.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const parsed = componentUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid salary component payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const existing = await app.prisma.salaryComponent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'NOT_FOUND', 'Salary component not found', 404);
    }

    try {
      const component = await app.prisma.salaryComponent.update({
        where: { id },
        data: body,
      });

      await app.audit.record({
        ...contextFromReq(request),
        action: 'salary.component_update',
        entity: 'salaryComponent',
        entityId: component.id,
        newValue: { code: component.code, type: component.type, calculationType: component.calculationType },
      });

      return sendSuccess(reply, component, 'Salary component updated');
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return sendError(reply, 'COMPONENT_EXISTS', `A salary component with code ${body.code} already exists`, 409);
      }
      throw error;
    }
  });

  // DELETE /api/v1/payroll/salary/components/:id
  app.delete('/salary/components/:id', {
    preHandler: [authenticate, requirePermission('salary.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.salaryComponent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return sendError(reply, 'NOT_FOUND', 'Salary component not found', 404);
    }

    await app.prisma.salaryComponent.delete({ where: { id } });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'salary.component_delete',
      entity: 'salaryComponent',
      entityId: existing.id,
      newValue: { code: existing.code },
    });

    return sendSuccess(reply, { id: existing.id }, 'Salary component deleted');
  });
}