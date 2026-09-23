import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendSuccess, sendPaginated } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  branchId: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
  basicSalary: z.number().default(0),
});

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED'] as const;

/**
 * Whitelist of mutable employee fields. Protected/derived fields such as
 * `organizationId`, `userId`, `employeeCode` and `deletedAt` are deliberately
 * excluded to prevent mass-assignment.
 */
const updateEmployeeSchema = z
  .object({
    firstName: z.string().min(1).max(120).optional(),
    lastName: z.string().min(1).max(120).optional(),
    email: z.string().email().max(254).optional(),
    phone: z.string().max(30).optional().nullable(),
    avatarUrl: z.string().url().max(500).optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    gender: z.string().max(30).optional().nullable(),
    maritalStatus: z.string().max(30).optional().nullable(),
    joiningDate: z.coerce.date().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    departmentId: z.string().optional().nullable(),
    designationId: z.string().optional().nullable(),
    branchId: z.string().optional().nullable(),
    managerId: z.string().optional().nullable(),
    basicSalary: z.number().min(0).optional(),
    payFrequency: z.string().max(20).optional(),
    bankName: z.string().max(120).optional().nullable(),
    accountNumber: z.string().max(40).optional().nullable(),
    taxId: z.string().max(40).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    emergencyContactName: z.string().max(120).optional().nullable(),
    emergencyContactPhone: z.string().max(30).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/employees
  app.get('/', {
    preHandler: [authenticate, requirePermission('employees.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; search?: string; departmentId?: string; status?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId, deletedAt: null };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      app.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, title: true } },
          branch: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      app.prisma.employee.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  // GET /api/v1/employees/:id
  app.get('/:id', {
    preHandler: [authenticate, requirePermission('employees.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const employee = await app.prisma.employee.findFirst({
      where: { id, organizationId: orgId },
      include: {
        department: true,
        designation: true,
        branch: true,
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        attendanceRecords: { take: 10, orderBy: { date: 'desc' } },
        leaveRequests: { take: 10, orderBy: { createdAt: 'desc' } },
        assignedAssets: { orderBy: { assignedAt: 'desc' } },
        payslips: {
          take: 6,
          orderBy: { createdAt: 'desc' },
          include: { payrollRun: { select: { month: true, year: true, startDate: true, endDate: true, status: true } } },
        },
        onboardingAssignments: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          include: { template: { select: { name: true } } },
        },
      },
    });

    if (!employee) {
      return reply.status(404).send({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' } });
    }

    return sendSuccess(reply, employee);
  });

  // POST /api/v1/employees
  app.post('/', {
    preHandler: [authenticate, requirePermission('employees.create')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = createEmployeeSchema.parse(request.body);

    const employee = await app.prisma.employee.create({
      data: {
        organizationId: orgId,
        ...body,
      },
      include: {
        department: true,
        designation: true,
        branch: true,
      },
    });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'employees.create',
      entity: 'employee',
      entityId: employee.id,
      metadata: { code: employee.employeeCode, email: employee.email },
    });

    return sendSuccess(reply, employee, 'Employee created successfully');
  });

  // PATCH /api/v1/employees/:id
  app.patch('/:id', {
    preHandler: [authenticate, requirePermission('employees.update')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const body = updateEmployeeSchema.parse(request.body);

    // Reference-integrity: every referenced record must belong to this org.
    const refs: { label: 'department' | 'designation' | 'branch' | 'manager'; field: string }[] = [];
    for (const entry of [
      ['department', body.departmentId],
      ['designation', body.designationId],
      ['branch', body.branchId],
      ['manager', body.managerId],
    ] as const) {
      if (typeof entry[1] === 'string') refs.push({ label: entry[0], field: entry[1] });
    }

    for (const ref of refs) {
      let belongs: number;
      if (ref.label === 'manager') {
        belongs = (await app.prisma.employee.count({ where: { id: ref.field, organizationId: orgId } }));
      } else {
        const delegate = app.prisma[ref.label] as unknown as {
          count: (args: { where: { id: string; organizationId: string } }) => Promise<number>;
        };
        belongs = await delegate.count({ where: { id: ref.field, organizationId: orgId } });
      }
      if (!belongs) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_REFERENCE', message: `${ref.label} does not belong to this organization` },
        });
      }
    }

    const updated = await app.prisma.employee.updateMany({
      where: { id, organizationId: orgId },
      data: body,
    });

    if (updated.count === 0) {
      return reply.status(404).send({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' } });
    }

    const employee = await app.prisma.employee.findUnique({ where: { id } });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'employees.update',
      entity: 'employee',
      entityId: id,
    });

    return sendSuccess(reply, employee, 'Employee updated successfully');
  });

  // DELETE /api/v1/employees/:id
  app.delete('/:id', {
    preHandler: [authenticate, requirePermission('employees.delete')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    await app.prisma.employee.updateMany({
      where: { id, organizationId: orgId },
      data: { status: 'TERMINATED', deletedAt: new Date() },
    });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'employees.delete',
      entity: 'employee',
      entityId: id,
    });

    return sendSuccess(reply, null, 'Employee deactivated successfully');
  });
}
