import type { PrismaClient } from '@prisma/client';
import {
  naiveStartOfDay,
  instantToZkNaive,
} from './timezone';
import type { BiometricDeviceRow } from './types';

/** Raw ZK verification modes that indicate a face scan. Model-dependent. */
const FACE_VERIFY_MODES = new Set([15, 23, 32, 33, 39, 64, 65, 66, 67, 68, 69]);
/** Raw ZK verification modes that indicate a fingerprint scan. Model-dependent. */
const FINGERPRINT_VERIFY_MODES = new Set([0, 1, 2, 6, 25, 26]);

export interface BiometricPunch {
  /** The id printed on the device (or the device-internal uid). */
  deviceUserId: string;
  punchTime: Date;
  /** 0 = check-in, 1 = check-out on most ZK models. */
  punchState: number;
  verifyMode: number;
  source: 'PULL' | 'REALTIME' | 'API';
  rawJson?: unknown;
}

export interface PunchResult {
  matched: boolean;
  punchLogId: string;
  attendanceRecordId?: string;
  /** 'created' | 'updated' when an attendance record was written, 'noop' otherwise. */
  action?: 'created' | 'updated' | 'noop';
  checkIn?: Date;
  checkOut?: Date;
}

export function verifyModeToMethod(
  deviceMode: BiometricDeviceRow['mode'],
  verifyMode: number,
): 'FACE' | 'FINGERPRINT' {
  if (deviceMode === 'FACE') return 'FACE';
  if (deviceMode === 'FINGERPRINT') return 'FINGERPRINT';
  if (FACE_VERIFY_MODES.has(verifyMode)) return 'FACE';
  if (FINGERPRINT_VERIFY_MODES.has(verifyMode)) return 'FINGERPRINT';
  return 'FINGERPRINT';
}

/**
 * Raw verify mode to stamp on pulls/realtime punches. node-zklib records carry
 * no verify mode at all, so the punch inherits the terminal's configured
 * modality. 15 is the ZK face-scan code, 1 the fingerprint code — the same
 * values a face terminal reports over ADMS, keeping both channels consistent.
 */
export function defaultZkVerifyMode(deviceMode: BiometricDeviceRow['mode']): number {
  return deviceMode === 'FACE' ? 15 : 1;
}

export async function resolveEmployee(
  prisma: PrismaClient,
  orgId: string,
  deviceId: string,
  deviceUserId: string,
): Promise<{ id: string; employeeCode: string } | null> {
  const enrollment = await prisma.employeeBiometric.findFirst({
    where: { organizationId: orgId, deviceId, deviceUserId },
    select: { employee: { select: { id: true, employeeCode: true } } },
  });
  if (enrollment) return enrollment.employee;

  const byCode = await prisma.employee.findFirst({
    where: {
      organizationId: orgId,
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
      employeeCode: deviceUserId,
    },
    select: { id: true, employeeCode: true },
  });
  return byCode;
}

/**
 * Core intake: persists every punch the terminal reported (BiometricPunchLog)
 * and folds it into that employee's AttendanceRecord for the calendar day.
 * Idempotent — repeated syncs of the same punch just touch the same rows.
 */
export async function ingestPunch(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  timeZone: string,
  punch: BiometricPunch,
): Promise<PunchResult> {
  const orgId = device.organizationId;
  const employee = await resolveEmployee(prisma, orgId, device.id, punch.deviceUserId);
  const wall = instantToZkNaive(punch.punchTime, timeZone);
  const punchDay = naiveStartOfDay(wall, timeZone);

  const log = await prisma.biometricPunchLog.upsert({
    where: {
      deviceId_deviceUserId_punchTime_punchState: {
        deviceId: device.id,
        deviceUserId: punch.deviceUserId,
        punchTime: punch.punchTime,
        punchState: punch.punchState,
      },
    },
    create: {
      organizationId: orgId,
      deviceId: device.id,
      employeeId: employee?.id ?? null,
      deviceUserId: punch.deviceUserId,
      punchTime: punch.punchTime,
      punchState: punch.punchState,
      verifyMode: punch.verifyMode,
      source: punch.source,
      rawJson: punch.rawJson as never,
    },
    update: {
      employeeId: employee?.id ?? null,
      verifyMode: punch.verifyMode,
    },
  });

  if (!employee) {
    return { matched: false, punchLogId: log.id };
  }

  const method = verifyModeToMethod(device.mode, punch.verifyMode);
  const isOut = punch.punchState === 1;
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: punchDay } },
  });

  let record: { id: string; checkIn: Date | null; checkOut: Date | null };
  let action: 'created' | 'updated' | 'noop';

  if (existing) {
    const data: Record<string, unknown> = { method };
    if (isOut) {
      const alreadyLater = existing.checkOut !== null && existing.checkOut >= punch.punchTime;
      if (!alreadyLater) {
        const base = existing.checkIn ?? punch.punchTime;
        const workHours = Math.max(0, (punch.punchTime.getTime() - base.getTime()) / 3_600_000);
        data.checkOut = punch.punchTime;
        data.workHours = Math.round(workHours * 100) / 100;
        data.deviceId = device.id;
      }
    } else {
      const alreadyEarlier = existing.checkIn !== null && existing.checkIn <= punch.punchTime;
      if (!alreadyEarlier) {
        data.checkIn = punch.punchTime;
        data.deviceId = device.id;
        data.status = 'PRESENT';
      }
    }

    if (Object.keys(data).length === 0) {
      record = existing;
      action = 'noop';
    } else {
      record = await prisma.attendanceRecord.update({ where: { id: existing.id }, data });
      action = 'updated';
    }
  } else {
    record = await prisma.attendanceRecord.create({
      data: {
        organizationId: orgId,
        employeeId: employee.id,
        date: punchDay,
        checkIn: isOut ? null : punch.punchTime,
        checkOut: isOut ? punch.punchTime : null,
        status: 'PRESENT',
        method,
        deviceId: device.id,
        workHours: 0,
      },
    });
    action = 'created';
  }

  if (log.attendanceRecordId !== record.id) {
    await prisma.biometricPunchLog.update({
      where: { id: log.id },
      data: { attendanceRecordId: record.id },
    });
  }

  return {
    matched: true,
    punchLogId: log.id,
    attendanceRecordId: record.id,
    action,
    checkIn: record.checkIn ?? undefined,
    checkOut: record.checkOut ?? undefined,
  };
}