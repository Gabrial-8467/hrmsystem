import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError, sendSuccess, sendPaginated } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireAnyPermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';
import { biometricHardwareRoutes } from './biometric-routes';

interface PunchBody {
  method?: 'WEB' | 'FACE' | 'FINGERPRINT' | 'DEVICE';
  deviceCode?: string;
  lat?: number;
  lng?: number;
}

const shiftBodySchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  breakDurationMinutes: z.number().int().min(0).max(240).default(60),
  gracePeriodMinutes: z.number().int().min(0).max(120).default(15),
  fullDayHours: z.number().min(0.5).max(16).default(8),
  halfDayHours: z.number().min(0.5).max(16).default(4),
});

const shiftUpdateSchema = shiftBodySchema.partial();

const shiftAssignmentBodySchema = z.object({
  employeeId: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
});

const holidayBodySchema = z.object({
  name: z.string().min(1).max(120),
  date: z.coerce.date(),
  type: z.enum(['NATIONAL', 'REGIONAL', 'COMPANY', 'RELIGIOUS']).default('NATIONAL'),
  description: z.string().max(300).optional().nullable(),
});

const holidayUpdateSchema = holidayBodySchema.partial();

const correctionBodySchema = z.object({
  employeeId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  attendanceRecordId: z.string().min(1).optional(),
  proposedCheckIn: z.coerce.date(),
  proposedCheckOut: z.coerce.date(),
  reason: z.string().min(1).max(500),
});

const correctionStatusSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.status !== 'REJECTED' || !!v.rejectionReason, {
    message: 'Rejection reason is required when rejecting a correction',
    path: ['rejectionReason'],
  });

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayBounds(d: Date): { start: Date; end: Date } {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
  };
}

function roundHours(ms: number): number {
  return Math.round((ms / 3600000) * 100) / 100;
}

async function resolveEmployee(app: FastifyInstance, orgId: string, userId: string) {
  return app.prisma.employee.findFirst({ where: { userId, organizationId: orgId } });
}

export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/attendance
  app.get('/', {
    preHandler: [authenticate, requirePermission('attendance.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { page?: string; limit?: string; date?: string; status?: string; method?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '30', 10)));
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.date) {
      const d = new Date(query.date);
      where.date = {
        gte: new Date(d.setHours(0, 0, 0, 0)),
        lte: new Date(d.setHours(23, 59, 59, 999)),
      };
    }

    const [items, total] = await Promise.all([
      app.prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true } },
          device: { select: { id: true, name: true, code: true } },
        },
      }),
      app.prisma.attendanceRecord.count({ where }),
    ]);

    return sendPaginated(reply, items, total, page, limit);
  });

  // POST /api/v1/attendance/check-in
  app.post('/check-in', {
    preHandler: [authenticate, requirePermission('attendance.self')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const userId = request.user!.id;
    const body = (request.body ?? {}) as PunchBody;
    const method = body.method ?? 'WEB';

    const emp = await resolveEmployee(app, orgId, userId);
    if (!emp) {
      return reply.status(400).send({ success: false, error: { code: 'EMPLOYEE_NOT_LINKED', message: 'No employee profile linked' } });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await app.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: today } },
      create: {
        organizationId: orgId,
        employeeId: emp.id,
        date: today,
        checkIn: new Date(),
        status: 'PRESENT',
        method,
      },
      update: {
        checkIn: new Date(),
        status: 'PRESENT',
        method,
      },
    });

    return sendSuccess(reply, record, 'Checked in successfully');
  });

  // POST /api/v1/attendance/check-out
  app.post('/check-out', {
    preHandler: [authenticate, requirePermission('attendance.self')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const userId = request.user!.id;
    const body = (request.body ?? {}) as PunchBody;
    const method = body.method ?? 'WEB';

    const emp = await resolveEmployee(app, orgId, userId);
    if (!emp) {
      return reply.status(400).send({ success: false, error: { code: 'EMPLOYEE_NOT_LINKED', message: 'No employee profile linked' } });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await app.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: today } },
      select: { id: true, checkIn: true },
    });

    if (!existing?.checkIn) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_CHECK_IN', message: 'Check in before checking out' },
      });
    }

    const checkOut = new Date();
    const workHours = Math.max(0, (checkOut.getTime() - existing.checkIn.getTime()) / 3_600_000);

    const record = await app.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOut,
        workHours: Math.round(workHours * 100) / 100,
        method,
        notes: body.method && body.method !== 'WEB' ? `Punched via ${body.method}` : undefined,
      },
    });

    return sendSuccess(reply, record, 'Checked out successfully');
  });

  // ==============================
  // Biometric Devices
  // ==============================

  // GET /api/v1/attendance/devices
  app.get('/devices', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const devices = await app.prisma.biometricDevice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { attendanceRecords: true, punchLogs: true, enrollments: true } },
      },
    });
    const withStatus = devices.map((d) => ({
      ...d,
      listening: app.biometric.isListening(d.id),
      realtimeError: app.biometric.lastError(d.id),
    }));
    return sendSuccess(reply, withStatus);
  });

  // POST /api/v1/attendance/devices
  app.post('/devices', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = request.body as {
      name: string;
      code: string;
      mode?: 'FACE' | 'FINGERPRINT' | 'HYBRID';
      serialNumber?: string;
      ipAddress?: string;
      port?: number;
      location?: string;
    };

    if (!body.name || !body.code) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'name and code are required' } });
    }

    const exists = await app.prisma.biometricDevice.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: body.code } },
    });
    if (exists) {
      return reply.status(400).send({ success: false, error: { code: 'DUPLICATE_DEVICE', message: 'A device with this code already exists' } });
    }

    const device = await app.prisma.biometricDevice.create({
      data: {
        organizationId: orgId,
        name: body.name,
        code: body.code,
        mode: body.mode ?? 'HYBRID',
        serialNumber: body.serialNumber,
        ipAddress: body.ipAddress,
        port: body.port ?? 4370,
        location: body.location,
      },
    });

    await app.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: request.user!.id,
        action: 'REGISTER',
        entity: 'biometric-device',
        entityId: device.id,
        metadata: { detail: `Registered biometric device ${device.name}` },
      },
    });

    return sendSuccess(reply, device, 'Device registered');
  });

  // PATCH /api/v1/attendance/devices/:id
  app.patch('/devices/:id', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      mode?: 'FACE' | 'FINGERPRINT' | 'HYBRID';
      status?: 'ONLINE' | 'OFFLINE' | 'PAUSED';
      commKey?: number;
      serialNumber?: string;
      ipAddress?: string;
      port?: number;
      location?: string;
    };

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const updated = await app.prisma.biometricDevice.update({
      where: { id },
      data: {
        name: body.name,
        mode: body.mode,
        status: body.status,
        commKey: typeof body.commKey === 'number' ? body.commKey : undefined,
        serialNumber: body.serialNumber,
        ipAddress: body.ipAddress,
        port: body.port,
        location: body.location,
      },
    });

    return sendSuccess(reply, updated, 'Device updated');
  });

  // DELETE /api/v1/attendance/devices/:id
  app.delete('/devices/:id', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    await app.prisma.biometricDevice.delete({ where: { id } });
    return sendSuccess(reply, { id }, 'Device deleted');
  });

  // POST /api/v1/attendance/devices/:id/ping
  app.post('/devices/:id/ping', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const updated = await app.prisma.biometricDevice.update({
      where: { id },
      data: { status: 'ONLINE', lastPingAt: new Date() },
    });

    return sendSuccess(reply, updated, 'Device is online');
  });

  // POST /api/v1/attendance/devices/simulate-punch
  // Simulates a hardware terminal pushing a fingerprint/face-ID punch event.
  app.post('/devices/simulate-punch', {
    preHandler: [authenticate, requirePermission('attendance.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = request.body as {
      employeeCode?: string;
      employeeId?: string;
      deviceCode?: string;
      mode?: 'FACE' | 'FINGERPRINT' | 'HYBRID';
      type?: 'IN' | 'OUT';
    };
    const type = body.type ?? 'IN';

    const device = await app.prisma.biometricDevice.findFirst({
      where: {
        organizationId: orgId,
        ...(body.deviceCode ? { code: body.deviceCode } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!device) {
      return reply.status(400).send({ success: false, error: { code: 'DEVICE_NOT_FOUND', message: 'Register a device first' } });
    }

    const emp = body.employeeId
      ? await app.prisma.employee.findFirst({ where: { id: body.employeeId, organizationId: orgId } })
      : await app.prisma.employee.findFirst({
          where: { organizationId: orgId, ...(body.employeeCode ? { employeeCode: body.employeeCode } : {}) },
        });
    if (!emp) {
      return reply.status(400).send({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' } });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existed = await app.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: today } },
    });

    const baseData = {
      organizationId: orgId,
      employeeId: emp.id,
      date: today,
      deviceId: device.id,
      method: 'DEVICE' as const,
      status: 'PRESENT' as const,
    };

    let record;
    if (type === 'IN') {
      record = await app.prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: today } },
        create: { ...baseData, checkIn: new Date() },
        update: { checkIn: new Date(), deviceId: device.id, method: 'DEVICE' },
      });
    } else {
      if (!existed?.checkIn) {
        return reply.status(400).send({ success: false, error: { code: 'NO_CHECK_IN', message: 'Employee has no check-in for today' } });
      }
      const checkOut = new Date();
      const workHours = Math.max(0, (checkOut.getTime() - existed.checkIn.getTime()) / 3_600_000);
      record = await app.prisma.attendanceRecord.update({
        where: { id: existed.id },
        data: { checkOut, workHours: Math.round(workHours * 100) / 100, deviceId: device.id, method: 'DEVICE' },
      });
    }

    await app.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: request.user!.id,
        action: 'PUNCH',
        entity: 'attendance',
        entityId: record.id,
        metadata: { detail: `${type} punched for ${emp.firstName} ${emp.lastName} via ${device.name} (${body.mode ?? 'HYBRID'})` },
      },
    });

    return sendSuccess(reply, record, `${type} punched at ${device.name}`);
  });

  // --- Shifts ---
  app.get('/shifts', {
    preHandler: [authenticate, requirePermission('shifts.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.shift.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
    return sendSuccess(reply, items);
  });

  app.get('/shifts/:id', {
    preHandler: [authenticate, requirePermission('shifts.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const shift = await app.prisma.shift.findFirst({
      where: { id, organizationId: orgId },
      include: {
        _count: { select: { assignments: true } },
        assignments: {
          include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        },
      },
    });
    if (!shift) return sendError(reply, 'SHIFT_NOT_FOUND', 'Shift not found', 404);
    return sendSuccess(reply, shift);
  });

  app.post('/shifts', {
    preHandler: [authenticate, requirePermission('shifts.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = shiftBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid shift payload', 400, parsed.error.flatten().fieldErrors);
    }
    const code = parsed.data.code.toUpperCase();
    const dup = await app.prisma.shift.findFirst({ where: { organizationId: orgId, code } });
    if (dup) return sendError(reply, 'SHIFT_EXISTS', `A shift with code ${code} already exists`, 409);

    const shift = await app.prisma.shift.create({
      data: { organizationId: orgId, ...parsed.data, code },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'shifts.shift_create',
      entity: 'shift',
      entityId: shift.id,
      newValue: { name: shift.name, code: shift.code, startTime: shift.startTime, endTime: shift.endTime },
    });
    return sendSuccess(reply, shift, 'Shift created successfully');
  });

  app.patch('/shifts/:id', {
    preHandler: [authenticate, requirePermission('shifts.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = shiftUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid shift payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.shift.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'SHIFT_NOT_FOUND', 'Shift not found', 404);

    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.code === 'string') {
      data.code = (data.code as string).toUpperCase();
      if (data.code !== existing.code) {
        const dup = await app.prisma.shift.findFirst({ where: { organizationId: orgId, code: data.code as string } });
        if (dup) return sendError(reply, 'SHIFT_EXISTS', `A shift with code ${data.code} already exists`, 409);
      }
    }

    const shift = await app.prisma.shift.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'shifts.shift_update',
      entity: 'shift',
      entityId: shift.id,
      newValue: { name: shift.name, code: shift.code },
    });
    return sendSuccess(reply, shift, 'Shift updated successfully');
  });

  app.delete('/shifts/:id', {
    preHandler: [authenticate, requirePermission('shifts.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const shift = await app.prisma.shift.findFirst({ where: { id, organizationId: orgId } });
    if (!shift) return sendError(reply, 'SHIFT_NOT_FOUND', 'Shift not found', 404);
    const assigned = await app.prisma.shiftAssignment.count({ where: { shiftId: id, organizationId: orgId } });
    if (assigned > 0) {
      return sendError(reply, 'SHIFT_IN_USE', 'Shift is assigned to employees and cannot be deleted', 409);
    }
    await app.prisma.shift.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'shifts.shift_delete',
      entity: 'shift',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Shift deleted successfully');
  });

  // --- Shift Assignments ---
  app.post('/shifts/:id/assignments', {
    preHandler: [authenticate, requirePermission('shifts.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = shiftAssignmentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid assignment payload', 400, parsed.error.flatten().fieldErrors);
    }
    const shift = await app.prisma.shift.findFirst({ where: { id, organizationId: orgId } });
    if (!shift) return sendError(reply, 'SHIFT_NOT_FOUND', 'Shift not found', 404);
    const employee = await app.prisma.employee.findFirst({ where: { id: parsed.data.employeeId, organizationId: orgId } });
    if (!employee) return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee not found in this organization', 400);
    if (parsed.data.endDate && parsed.data.startDate > parsed.data.endDate) {
      return sendError(reply, 'INVALID_REQUEST', 'endDate must be on or after startDate', 400);
    }

    const assignment = await app.prisma.shiftAssignment.create({
      data: {
        organizationId: orgId,
        shiftId: shift.id,
        employeeId: employee.id,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? null,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'shifts.assignment_create',
      entity: 'shiftAssignment',
      entityId: assignment.id,
      newValue: { shiftId: shift.id, employeeId: employee.id, startDate: assignment.startDate.toISOString() },
    });
    return sendSuccess(reply, assignment, 'Employee assigned to shift');
  });

  app.delete('/shifts/assignments/:assignmentId', {
    preHandler: [authenticate, requirePermission('shifts.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { assignmentId } = request.params as { assignmentId: string };
    const assignment = await app.prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, organizationId: orgId },
    });
    if (!assignment) return sendError(reply, 'ASSIGNMENT_NOT_FOUND', 'Shift assignment not found', 404);
    await app.prisma.shiftAssignment.delete({ where: { id: assignment.id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'shifts.assignment_delete',
      entity: 'shiftAssignment',
      entityId: assignment.id,
    });
    return sendSuccess(reply, null, 'Shift assignment removed');
  });

  // --- Holidays ---
  app.get('/holidays', {
    preHandler: [authenticate, requirePermission('holidays.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const query = request.query as { upcoming?: string };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = await app.prisma.holiday.findMany({
      where: {
        organizationId: orgId,
        ...(query.upcoming === 'true' ? { date: { gte: today } } : {}),
      },
      orderBy: { date: 'asc' },
    });
    return sendSuccess(reply, items);
  });

  app.post('/holidays', {
    preHandler: [authenticate, requirePermission('holidays.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = holidayBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid holiday payload', 400, parsed.error.flatten().fieldErrors);
    }
    const date = new Date(parsed.data.date);
    date.setHours(0, 0, 0, 0);

    const dup = await app.prisma.holiday.findFirst({ where: { organizationId: orgId, name: parsed.data.name, date } });
    if (dup) return sendError(reply, 'HOLIDAY_EXISTS', 'A holiday with this name already exists on that date', 409);

    const holiday = await app.prisma.holiday.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        date,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'holidays.holiday_create',
      entity: 'holiday',
      entityId: holiday.id,
      newValue: { name: holiday.name, date: holiday.date.toISOString(), type: holiday.type },
    });
    return sendSuccess(reply, holiday, 'Holiday created successfully');
  });

  app.patch('/holidays/:id', {
    preHandler: [authenticate, requirePermission('holidays.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = holidayUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid holiday payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.holiday.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'HOLIDAY_NOT_FOUND', 'Holiday not found', 404);

    const data: Record<string, unknown> = { ...parsed.data };
    if (data.date && data.date instanceof Date) {
      const d = new Date(data.date as Date);
      d.setHours(0, 0, 0, 0);
      data.date = d;
    }

    const holiday = await app.prisma.holiday.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'holidays.holiday_update',
      entity: 'holiday',
      entityId: holiday.id,
      newValue: { name: holiday.name, date: holiday.date.toISOString(), type: holiday.type },
    });
    return sendSuccess(reply, holiday, 'Holiday updated successfully');
  });

  app.delete('/holidays/:id', {
    preHandler: [authenticate, requirePermission('holidays.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const holiday = await app.prisma.holiday.findFirst({ where: { id, organizationId: orgId } });
    if (!holiday) return sendError(reply, 'HOLIDAY_NOT_FOUND', 'Holiday not found', 404);
    await app.prisma.holiday.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'holidays.holiday_delete',
      entity: 'holiday',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Holiday deleted successfully');
  });

  // ==============================
  // Attendance corrections
  // ==============================
  app.get('/corrections', {
    preHandler: [authenticate, requireAnyPermission(['attendance.correct', 'attendance.approve'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { status } = request.query as { status?: string };
    const where: Record<string, unknown> = { organizationId: orgId };
    if (status) where.status = status;
    const items = await app.prisma.attendanceCorrection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        attendanceRecord: { select: { id: true, date: true, checkIn: true, checkOut: true, status: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.post('/corrections', {
    preHandler: [authenticate, requireAnyPermission(['attendance.correct', 'attendance.self'])],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = correctionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid correction payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;
    const canManageOthers = request.user!.permissions.has('attendance.correct');
    const callerEmployee = await resolveEmployee(app, orgId, request.user!.id);

    let targetEmployeeId = body.employeeId;
    if (!targetEmployeeId) {
      if (!callerEmployee) {
        return sendError(reply, 'EMPLOYEE_PROFILE_REQUIRED', 'No employee profile is linked to this account', 400);
      }
      targetEmployeeId = callerEmployee.id;
    } else if (!canManageOthers && callerEmployee && targetEmployeeId !== callerEmployee.id) {
      return sendError(reply, 'SELF_ONLY', 'You can only request corrections for your own attendance', 403);
    }

    const targetEmployee = await app.prisma.employee.findFirst({
      where: { id: targetEmployeeId, organizationId: orgId },
      select: { id: true },
    });
    if (!targetEmployee) {
      return sendError(reply, 'EMPLOYEE_NOT_FOUND', 'Employee does not belong to this organization', 400);
    }

    let date = body.date;
    if (body.attendanceRecordId) {
      const record = await app.prisma.attendanceRecord.findFirst({
        where: { id: body.attendanceRecordId, organizationId: orgId, employeeId: targetEmployeeId },
      });
      if (!record) {
        return sendError(reply, 'ATTENDANCE_RECORD_NOT_FOUND', 'Attendance record not found for this employee', 400);
      }
      date = record.date;
    }
    if (!date) date = new Date();

    if (!sameDay(body.proposedCheckIn, date) || !sameDay(body.proposedCheckOut, date)) {
      return sendError(reply, 'INVALID_REQUEST', 'Proposed times must fall on the correction date', 400);
    }
    if (body.proposedCheckOut <= body.proposedCheckIn) {
      return sendError(reply, 'INVALID_REQUEST', 'Proposed check-out must be after check-in', 400);
    }

    const { start, end } = dayBounds(date);
    const existing = await app.prisma.attendanceCorrection.findFirst({
      where: { organizationId: orgId, employeeId: targetEmployeeId, date: { gte: start, lt: end }, status: 'PENDING' },
    });
    if (existing) {
      return sendError(reply, 'CORRECTION_ALREADY_PENDING', 'A pending correction already exists for this date', 409);
    }

    const correction = await app.prisma.attendanceCorrection.create({
      data: {
        organizationId: orgId,
        employeeId: targetEmployeeId,
        attendanceRecordId: body.attendanceRecordId ?? null,
        date,
        proposedCheckIn: body.proposedCheckIn,
        proposedCheckOut: body.proposedCheckOut,
        reason: body.reason,
      },
    });

    await app.audit.record({
      ...contextFromReq(request),
      action: 'attendance.correction_request',
      entity: 'attendanceCorrection',
      entityId: correction.id,
      newValue: {
        employeeId: targetEmployeeId,
        date: date.toISOString(),
        checkIn: correction.proposedCheckIn.toISOString(),
        checkOut: correction.proposedCheckOut.toISOString(),
      },
    });

    return sendSuccess(reply, correction, 'Correction requested');
  });

  app.patch('/corrections/:id/status', {
    preHandler: [authenticate, requirePermission('attendance.approve')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = correctionStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid correction status update', 400, parsed.error.flatten().fieldErrors);
    }

    const correction = await app.prisma.attendanceCorrection.findFirst({
      where: { id, organizationId: orgId },
      include: { employee: { select: { id: true, userId: true } } },
    });
    if (!correction) {
      return sendError(reply, 'CORRECTION_NOT_FOUND', 'Correction not found', 404);
    }
    if (correction.status !== 'PENDING') {
      return sendError(reply, 'ALREADY_PROCESSED', `This correction has already been ${correction.status.toLowerCase()}`, 409, {
        status: correction.status,
      });
    }

    const approver = await resolveEmployee(app, orgId, request.user!.id);
    if (approver && correction.employeeId === approver.id) {
      return sendError(reply, 'SELF_APPROVAL', 'You cannot approve or reject your own correction request', 409);
    }

    if (parsed.data.status === 'APPROVED') {
      const { start, end } = dayBounds(correction.date);
      const record = await app.prisma.attendanceRecord.findFirst({
        where: { organizationId: orgId, employeeId: correction.employeeId, date: { gte: start, lt: end } },
      });
      const workHours = roundHours(correction.proposedCheckOut.getTime() - correction.proposedCheckIn.getTime());
      const targetStatus = record && record.status !== 'ABSENT' ? record.status : 'PRESENT';

      await app.prisma.$transaction([
        app.prisma.attendanceCorrection.update({
          where: { id },
          data: { status: 'APPROVED', approvedBy: request.user!.id },
        }),
        app.prisma.attendanceRecord.upsert({
          where: {
            employeeId_date: { employeeId: correction.employeeId, date: record ? record.date : start },
          },
          update: { checkIn: correction.proposedCheckIn, checkOut: correction.proposedCheckOut, workHours, status: targetStatus },
          create: {
            organizationId: orgId,
            employeeId: correction.employeeId,
            date: start,
            checkIn: correction.proposedCheckIn,
            checkOut: correction.proposedCheckOut,
            workHours,
            status: 'PRESENT',
            method: 'WEB',
          },
        }),
      ]);

      await app.audit.record({
        ...contextFromReq(request),
        action: 'attendance.correction_approve',
        entity: 'attendanceCorrection',
        entityId: id,
        newValue: { employeeId: correction.employeeId, date: correction.date.toISOString(), workHours },
      });
      if (correction.employee.userId) {
        await app.notify.notify(orgId, [correction.employee.userId], {
          title: 'Attendance correction approved',
          message: 'Your attendance correction request was approved.',
          type: 'SUCCESS',
          link: '/attendance',
        });
      }
      return sendSuccess(reply, null, 'Correction approved');
    }

    await app.prisma.attendanceCorrection.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: request.user!.id },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'attendance.correction_reject',
      entity: 'attendanceCorrection',
      entityId: id,
      newValue: { employeeId: correction.employeeId, date: correction.date.toISOString(), reason: parsed.data.rejectionReason },
    });
    if (correction.employee.userId) {
      await app.notify.notify(orgId, [correction.employee.userId], {
        title: 'Attendance correction rejected',
        message: `Your attendance correction request was rejected${parsed.data.rejectionReason ? `: ${parsed.data.rejectionReason}` : '.'}`,
        type: 'ALERT',
        link: '/attendance',
      });
    }
    return sendSuccess(reply, null, 'Correction rejected');
  });

  // ==============================
  // Biometric hardware (ZK protocol over TCP/UDP port 4370)
  // ==============================
  await biometricHardwareRoutes(app);
}