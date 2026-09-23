import type { PrismaClient } from '@prisma/client';
import type { BiometricDeviceRow } from './types';
import { toDeviceRow } from './types';
import { naiveToDate, secondsToZkNaive } from './timezone';
import { ingestPunch } from './intake';

/**
 * ZKTeco ADMS / iClock device-push protocol.
 *
 * This is the *vendor-verified* alternative to reverse-engineering the binary
 * port-4370 protocol: modern terminals (SpeedFace, ZAM180-NF family, etc.)
 * push attendance over HTTP to `/iclock/*`. Wire format (confirmed on real
 * hardware by the s0x90/zkteco-adms effort):
 *
 *   POST /iclock/cdata?SN=<serial>&table=ATTLOG
 *   UserID\tYYYY-MM-DD HH:MM:SS\tStatus\tVerifyMode\tWorkCode
 *
 *   Status:   0 check-in, 1 check-out, 2 break-out, 3 break-in,
 *             4 overtime-in, 5 overtime-out
 *
 * Responses are plain text (`OK`, command lines), never the HRMS JSON
 * envelope, and the endpoints are intentionally unauthenticated — the
 * terminal cannot hold a JWT. Device trust is IP/serial scoping.
 */

export interface AdmsWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface AdmsRawPunch {
  deviceUserId: string;
  wall: AdmsWallClock;
  status: number;
  verifyMode: number;
  workCode: string | null;
  raw: string;
}

const STATUS_IS_OUT = new Set([1, 2, 5]);

export function admsStatusToPunchState(status: number): 0 | 1 {
  return STATUS_IS_OUT.has(status) ? 1 : 0;
}

function stripCrlf(s: string): string {
  return s.replace(/\r/g, '');
}

/** Drop the trailing CSV suffix some devices append (`,2024-01-01 08:00:00 123`). */
function stripTrailingCsv(line: string): string {
  return line
    .replace(/,\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?: \d+)?$/, '')
    .replace(/,\d+$/, '');
}

function toNaive(field: string): AdmsWallClock | null {
  const s = field.trim();
  if (/^\d{9,10}$/.test(s)) {
    const wall = secondsToZkNaive(Number(s));
    return {
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
    };
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
  };
}

function parsePunchLine(line: string): AdmsRawPunch | null {
  const clean = stripTrailingCsv(stripCrlf(line).trim());
  if (!clean || clean === '***') return null;

  const fields = clean.includes('\t') ? clean.split('\t') : clean.split(',');
  const deviceUserId = String(fields[0] ?? '').trim();
  if (!deviceUserId || deviceUserId === 'PIN') return null;

  const wall = toNaive(fields[1] ?? '');
  if (!wall) return null;

  const status = Number(fields[2]) || 0;
  const verifyMode = Number(fields[3]) || 0;
  const workCode = fields[4] ? String(fields[4]).trim() : null;

  return { deviceUserId, wall, status, verifyMode, workCode, raw: clean };
}

/** Parse an ADMS ATTLOG body (one punch per line). Header lines are skipped. */
export function parseAdmsCData(body: string): AdmsRawPunch[] {
  const records: AdmsRawPunch[] = [];
  for (const rawLine of stripCrlf(body).split('\n')) {
    const rec = parsePunchLine(rawLine);
    if (rec) records.push(rec);
  }
  return records;
}

export interface AdmsDeviceMatch {
  device: BiometricDeviceRow | null;
  matchedBy: 'serial' | 'ip' | null;
}

/**
 * Match an incoming device push to a registered terminal. Preference order:
 * serial number (`SN=` query), then remote IP. No token — this whole channel
 * is device-trusted.
 */
export async function matchAdmsDevice(
  prisma: PrismaClient,
  config: { sn?: string | null; remoteIp?: string | null },
): Promise<AdmsDeviceMatch> {
  const sn = config.sn?.trim();
  if (sn) {
    const device = await prisma.biometricDevice.findFirst({
      where: { serialNumber: sn },
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { timezone: true } } },
    });
    if (device) return { device: toDeviceRow(device), matchedBy: 'serial' };
  }

  const remoteIp = config.remoteIp?.trim();
  if (remoteIp) {
    const device = await prisma.biometricDevice.findFirst({
      where: { ipAddress: remoteIp },
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { timezone: true } } },
    });
    if (device) return { device: toDeviceRow(device), matchedBy: 'ip' };
  }

  return { device: null, matchedBy: null };
}

export async function markAdmsDeviceSeen(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  sn?: string | null,
): Promise<void> {
  const data: { status: 'ONLINE'; lastPingAt: Date; serialNumber?: string } = {
    status: 'ONLINE',
    lastPingAt: new Date(),
  };
  const serial = sn?.trim();
  if (serial && device.serialNumber !== serial) {
    const conflict = await prisma.biometricDevice.count({ where: { serialNumber: serial } });
    if (conflict === 0) data.serialNumber = serial;
  }
  await prisma.biometricDevice.update({ where: { id: device.id }, data }).catch(() => {});
}

export interface AdmsIngestResult {
  received: number;
  matched: number;
  unmatched: number;
}

/** Fold ADMS punches through the same intake as pulls/realtime punches. */
export async function ingestAdmsPunches(
  prisma: PrismaClient,
  device: BiometricDeviceRow,
  records: AdmsRawPunch[],
): Promise<AdmsIngestResult> {
  let matched = 0;
  let unmatched = 0;
  for (const rec of records) {
    const punchTime = naiveToDate(
      { ...rec.wall, local: '' },
      device.timeZone,
    );
    const result = await ingestPunch(prisma, device, device.timeZone, {
      deviceUserId: rec.deviceUserId,
      punchTime,
      punchState: admsStatusToPunchState(rec.status),
      verifyMode: rec.verifyMode,
      source: 'API',
      rawJson: {
        engine: 'zkteco-adms',
        admsStatus: rec.status,
        workCode: rec.workCode,
        raw: rec.raw,
      },
    });
    if (result.matched) matched += 1;
    else unmatched += 1;
  }
  return { received: records.length, matched, unmatched };
}