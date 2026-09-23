import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';
import { loadDeviceRow, toDeviceRow, syncDevice } from '../../services/biometric';

const hardwareGuard = [authenticate, requirePermission('attendance.manage')];

/**
 * Hardware-facing biometric endpoints. Everything here is scoped to the
 * caller's organization and gated behind `attendance.manage`.
 */
export async function biometricHardwareRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/attendance/devices/sync-all
  app.post('/devices/sync-all', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const body = (request.body ?? {}) as { clearAfterSync?: boolean };
    const clearAfterSync = body.clearAfterSync === true;
    const devices = await app.prisma.biometricDevice.findMany({
      where: { organizationId: orgId, ipAddress: { not: null } },
      include: { organization: { select: { timezone: true } } },
    });

    const skippable: string[] = [];
    for (const d of devices) {
      if (app.biometric.isListening(d.id)) {
        skippable.push(d.code);
      }
    }
    const toSync = devices.filter((d) => !skippable.includes(d.code));

    const results = [];
    for (const d of toSync) {
      const row = toDeviceRow(d as never);
      results.push(await syncDevice(app.prisma, row, row.timeZone, { clearAfterSync }));
    }

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'SYNC_ALL',
      entity: 'biometric-device',
      metadata: {
        detail: `Bulk sync ran against ${toSync.length} terminal(s)${clearAfterSync ? ', clearing buffers after pull' : ''}`,
      },
    });

    return sendSuccess(reply, { synced: toSync.length, skipped: skippable.length, results }, 'Devices synced');
  });

  // POST /api/v1/attendance/devices/:id/sync
  app.post('/devices/:id/sync', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { clearAfterSync?: boolean };
    const clearAfterSync = body.clearAfterSync === true;

    const row = await loadDeviceRow(app.prisma as never, orgId, id);
    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const summary = await syncDevice(app.prisma, row, row.timeZone, { clearAfterSync });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'SYNC',
      entity: 'biometric-device',
      entityId: id,
      metadata: {
        detail: `Sync of ${summary.total} punch(es) → ${summary.matched} matched, ${summary.unmatched} unmatched${clearAfterSync ? ', buffer cleared' : ''}`,
        status: summary.status,
      },
    });

    return sendSuccess(
      reply,
      { ...summary, device: { id: row.id, name: row.name, code: row.code } },
      summary.status === 'OK' ? 'Device synced' : 'Device could not be reached',
    );
  });

  // GET /api/v1/attendance/devices/:id/logs
  app.get('/devices/:id/logs', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; limit?: string; matched?: string };

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, code: true },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '30', 10)));
    const where = {
      deviceId: id,
      ...(query.matched === 'true' ? { employeeId: { not: null } } : {}),
      ...(query.matched === 'false' ? { employeeId: null } : {}),
    };

    const [items, total] = await Promise.all([
      app.prisma.biometricPunchLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { punchTime: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      }),
      app.prisma.biometricPunchLog.count({ where }),
    ]);

    return sendSuccess(reply, { device, items, total, page, limit });
  });

  // GET /api/v1/attendance/devices/:id/enrollments
  app.get('/devices/:id/enrollments', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const enrollments = await app.prisma.employeeBiometric.findMany({
      where: { deviceId: id, organizationId: orgId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true },
        },
      },
    });

    return sendSuccess(reply, enrollments);
  });

  // POST /api/v1/attendance/devices/:id/enrollments
  app.post('/devices/:id/enrollments', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const body = request.body as {
      employeeId: string;
      deviceUserId: string;
      nameOnDevice?: string;
      faceEnrolled?: boolean;
      fingerprints?: number;
    };

    if (!body.employeeId || !body.deviceUserId) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'employeeId and deviceUserId are required' } });
    }

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const employee = await app.prisma.employee.findFirst({
      where: { id: body.employeeId, organizationId: orgId },
      select: { id: true, employeeCode: true },
    });
    if (!employee) {
      return reply.status(404).send({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' } });
    }

    const exists = await app.prisma.employeeBiometric.findUnique({
      where: { employeeId_deviceId: { employeeId: body.employeeId, deviceId: id } },
    });
    if (exists) {
      return reply.status(409).send({ success: false, error: { code: 'ALREADY_ENROLLED', message: 'This employee is already enrolled on the device' } });
    }

    const userIdTaken = await app.prisma.employeeBiometric.findFirst({
      where: { deviceId: id, deviceUserId: body.deviceUserId },
    });
    if (userIdTaken) {
      return reply.status(409).send({ success: false, error: { code: 'DEVICE_USERID_TAKEN', message: 'That device user id is already in use' } });
    }

    const enrollment = await app.prisma.employeeBiometric.create({
      data: {
        organizationId: orgId,
        employeeId: body.employeeId,
        deviceId: id,
        deviceUserId: body.deviceUserId,
        nameOnDevice: body.nameOnDevice ?? employee.employeeCode,
        faceEnrolled: body.faceEnrolled ?? false,
        fingerprints: body.fingerprints ?? 0,
      },
    });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'ENROLL',
      entity: 'employee-biometric',
      entityId: enrollment.id,
      metadata: { detail: `Enrolled ${employee.employeeCode} on device with user id ${body.deviceUserId}` },
    });

    return sendSuccess(reply, enrollment, 'Employee enrolled on device');
  });

  // DELETE /api/v1/attendance/devices/:id/enrollments/:enrollmentId
  app.delete('/devices/:id/enrollments/:enrollmentId', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id, enrollmentId } = request.params as { id: string; enrollmentId: string };

    const enrollment = await app.prisma.employeeBiometric.findFirst({
      where: { id: enrollmentId, deviceId: id, organizationId: orgId },
      select: { id: true, employee: { select: { employeeCode: true } } },
    });
    if (!enrollment) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Enrollment not found' } });
    }

    await app.prisma.employeeBiometric.delete({ where: { id: enrollment.id } });

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'DELETE',
      entity: 'employee-biometric',
      entityId: enrollment.id,
      metadata: { detail: `Removed enrollment for ${enrollment.employee.employeeCode}` },
    });

    return sendSuccess(reply, { id: enrollment.id }, 'Enrollment removed');
  });

  // POST /api/v1/attendance/devices/:id/listen
  app.post('/devices/:id/listen', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user!.organizationId;

    const device = await app.prisma.biometricDevice.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, code: true },
    });
    if (!device) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    const result = await app.biometric.start(id, orgId);

    if (result.status === 'OK') {
      await app.audit.record({
        organizationId: orgId,
        userId: request.user!.id,
        action: 'LISTEN',
        entity: 'biometric-device',
        entityId: id,
        metadata: { detail: `Started realtime listening on ${device.code}` },
      });
    }

    return sendSuccess(reply, result, result.status === 'OK' ? 'Realtime listening enabled' : result.message);
  });

  // POST /api/v1/attendance/devices/:id/unlisten
  app.post('/devices/:id/unlisten', { preHandler: hardwareGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user!.organizationId;

    await app.biometric.stop(id);

    await app.audit.record({
      organizationId: orgId,
      userId: request.user!.id,
      action: 'LISTEN',
      entity: 'biometric-device',
      entityId: id,
      metadata: { detail: 'Stopped realtime listening' },
    });

    return sendSuccess(reply, { listening: false }, 'Realtime listening disabled');
  });
}

export default biometricHardwareRoutes;