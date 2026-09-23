import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import type { BiometricDeviceRow } from './types';
import { naiveToDate, secondsToZkNaive, localDateToNaive, instantToZkNaive, naiveStartOfDay } from './timezone';
import { ingestPunch, resolveEmployee, defaultZkVerifyMode } from './intake';
import { readZkSyncData, DEFAULT_ZK_TIMEOUT_MS, type ZkAdapterOptions, type ZkRawPunch } from './zklib';

export interface BiometricSyncSummary {
  deviceId: string;
  status: 'OK' | 'FAILED';
  error?: string;
  syncAt: Date;
  total: number;
  matched: number;
  unmatched: number;
  created: number;
  updated: number;
  identity?: {
    serialNumber: string | null;
    deviceName: string | null;
    platform: string | null;
    os: string | null;
    firmwareVersion: string | null;
    userCounts?: number;
    logCounts?: number;
  };
  timeDriftSeconds?: number;
  /** True when the terminal confirmed its attendance buffer was cleared. */
  cleared?: boolean;
}

export interface SyncDeviceOptions {
  /**
   * Ask the terminal to clear its internal attendance buffer after a
   * successful pull. ZK terminals keep appending forever, so re-syncs
   * re-read old logs; clearing keeps the device lean once HRMS has them.
   */
  clearAfterSync?: boolean;
}

const inFlight = new Set<string>();

function zkOptions(device: BiometricDeviceRow): ZkAdapterOptions {
  return {
    ip: device.ipAddress ?? device.name,
    port: device.port,
    commKey: device.commKey,
    timeoutMs: DEFAULT_ZK_TIMEOUT_MS,
  };
}

/** node-zklib returns wall components trapped in the server-local zone. */
function toOrgInstant(recordTime: Date, timeZone: string): Date {
  return naiveToDate(localDateToNaive(recordTime), timeZone);
}

/**
 * Infer IN/OUT for a pulled punch. node-zklib's attendance records carry no
 * punch state, so an employee with an open check-in for that day is leaving.
 */
async function inferPunchState(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  timeZone: string,
  deviceUserId: string,
  punchTime: Date,
): Promise<{ punchState: 0 | 1; employeeId: string | null }> {
  const employee = await resolveEmployee(prisma, device.organizationId, device.id, deviceUserId);
  if (!employee) return { punchState: 0, employeeId: null };
  const wall = instantToZkNaive(punchTime, timeZone);
  const day = naiveStartOfDay(wall, timeZone);
  const today = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: day } },
    select: { checkIn: true, checkOut: true },
  });
  const isOut = Boolean(today?.checkIn && !today.checkOut);
  return { punchState: isOut ? 1 : 0, employeeId: employee.id };
}

async function applyLogs(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  timeZone: string,
  logs: ZkRawPunch[],
): Promise<{ matched: number; unmatched: number; created: number; updated: number }> {
  let matched = 0;
  let unmatched = 0;
  let created = 0;
  let updated = 0;

  for (const log of logs) {
    // The terminal stores a naive wall reading (no zone); reinterpret it in
    // the organization timezone so punches land on the right calendar day.
    const punchTime = toOrgInstant(log.recordTime, timeZone);
    const { punchState, employeeId } = await inferPunchState(
      prisma,
      device,
      timeZone,
      log.deviceUserId,
      punchTime,
    );
    const result = await ingestPunch(prisma, device, timeZone, {
      deviceUserId: log.deviceUserId,
      punchTime,
      punchState,
      verifyMode: defaultZkVerifyMode(device.mode),
      source: 'PULL',
      rawJson: {
        engine: 'node-zklib',
        punchStateInferred: true,
        matchedEmployee: employeeId,
      },
    });
    if (result.matched) {
      matched += 1;
      if (result.action === 'created') created += 1;
      else if (result.action === 'updated') updated += 1;
    } else {
      unmatched += 1;
    }
  }

  return { matched, unmatched, created, updated };
}

async function flagFailure(
  prisma: PrismaClient,
  deviceId: string,
  at: Date,
  message: string,
): Promise<void> {
  await prisma.biometricDevice.update({
    where: { id: deviceId },
    data: {
      status: 'OFFLINE',
      lastSyncAt: at,
      lastSyncStatus: 'FAILED',
      lastSyncError: message.slice(0, 500),
      lastSyncCount: 0,
    },
  });
}

/**
 * Pull everything the terminal currently holds and fold it into attendance.
 * Never throws: an unreachable/refusing terminal yields a FAILED summary and
 * the device is marked OFFLINE, which the admin UI surfaces as "last sync".
 */
export async function syncDevice(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  timeZone: string,
  options?: SyncDeviceOptions,
): Promise<BiometricSyncSummary> {
  const clearAfterSync = options?.clearAfterSync === true;
  const started = new Date();
  const base: BiometricSyncSummary = {
    deviceId: device.id,
    status: 'OK',
    syncAt: started,
    total: 0,
    matched: 0,
    unmatched: 0,
    created: 0,
    updated: 0,
  };

  if (!device.ipAddress) {
    await flagFailure(prisma, device.id, started, 'No IP address configured for this terminal');
    return { ...base, status: 'FAILED', error: 'No IP address configured for this terminal' };
  }

  if (inFlight.has(device.id)) {
    return { ...base, status: 'FAILED', error: 'A sync for this device is already running' };
  }

  inFlight.add(device.id);
  await prisma.biometricDevice.update({
    where: { id: device.id },
    data: { lastSyncStatus: 'RUNNING' },
  });

  try {
    // node-zklib always dumps the whole terminal buffer; the punch-log upsert
    // in ingestPunch deduplicates, so no client-side incremental window needed.
    const { logs, clockSeconds, stats, cleared } = await readZkSyncData(
      zkOptions(device),
      undefined,
      { clearAfterSync },
    );

    const counts = await applyLogs(prisma, device, timeZone, logs);

    let timeDriftSeconds: number | undefined;
    if (typeof clockSeconds === 'number') {
      const deviceInstant = naiveToDate(secondsToZkNaive(clockSeconds), timeZone);
      timeDriftSeconds = Math.round((deviceInstant.getTime() - Date.now()) / 1000);
    }

    const identitySummary = {
      serialNumber: device.serialNumber,
      deviceName: null,
      platform: stats ? 'node-zklib' : null,
      os: null,
      firmwareVersion: null,
      userCounts: stats?.userCounts,
      logCounts: stats?.logCounts,
    };

    await prisma.biometricDevice.update({
      where: { id: device.id },
      data: {
        status: 'ONLINE',
        lastPingAt: started,
        lastSyncAt: started,
        lastSyncStatus: 'OK',
        lastSyncError: null,
        lastSyncCount: logs.length,
      },
    });

    return {
      ...base,
      identity: identitySummary,
      timeDriftSeconds,
      cleared,
      total: logs.length,
      matched: counts.matched,
      unmatched: counts.unmatched,
      created: counts.created,
      updated: counts.updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    logger.error({ err, deviceId: device.id }, 'Biometric device sync failed');
    await flagFailure(prisma, device.id, started, message);
    return { ...base, status: 'FAILED', error: message };
  } finally {
    inFlight.delete(device.id);
  }
}