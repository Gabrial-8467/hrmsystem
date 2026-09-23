import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import type { BiometricDeviceRow } from './types';
import { loadDeviceRow } from './types';
import { naiveToDate, localDateToNaive, naiveStartOfDay } from './timezone';
import { ingestPunch, resolveEmployee, defaultZkVerifyMode } from './intake';
import { openZkRealtime, DEFAULT_ZK_TIMEOUT_MS, type ZkAdapterOptions } from './zklib';

const RECONNECT_DELAY_MS = 10_000;

interface RunningSubscription {
  deviceId: string;
  startedAt: Date;
  stopped: false | true;
  lastError: string | null;
  closed: Promise<void>;
  resolveClosed: () => void;
  abort?: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function zkOptions(row: BiometricDeviceRow): ZkAdapterOptions {
  return {
    ip: row.ipAddress!,
    port: row.port,
    commKey: row.commKey,
    timeoutMs: DEFAULT_ZK_TIMEOUT_MS,
  };
}

/**
 * Long-lived realtime listeners for biometric terminals.
 *
 * Each entry subscribes to one terminal over ZK's TCP protocol and turns every
 * pushed attendance event into an attendance punch as it happens. The loop is
 * supervised: a dropped socket ends the stream and, after a short pause,
 * reconnect is attempted while the listener is still enabled. Polling remains
 * the source of truth — the stream makes punches appear sooner, it never
 * replaces a sync.
 */
export class BiometricRealtimeManager {
  private readonly prisma: PrismaClient;
  private readonly subs = new Map<string, RunningSubscription>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  isListening(deviceId: string): boolean {
    const sub = this.subs.get(deviceId);
    return sub ? !sub.stopped : false;
  }

  lastError(deviceId: string): string | null {
    return this.subs.get(deviceId)?.lastError ?? null;
  }

  active({ deviceId }: { deviceId: string }): boolean {
    return this.isListening(deviceId);
  }

  /**
   * Enable realtime for a device and return its status. Non-blocking: the
   * subscription settles in the background and reports failures through
   * `lastError` / the device's OFFLINE flag.
   */
  async start(deviceId: string, organizationId: string): Promise<{ status: 'OK' | 'FAILED'; message?: string }> {
    if (this.isListening(deviceId)) {
      return { status: 'OK', message: 'Already listening' };
    }

    const row = await loadDeviceRow(this.prisma as never, organizationId, deviceId);
    if (!row) return { status: 'FAILED', message: 'Device not found' };
    if (!row.ipAddress) return { status: 'FAILED', message: 'No IP address configured for this terminal' };

    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const sub: RunningSubscription = {
      deviceId,
      startedAt: new Date(),
      stopped: false,
      lastError: null,
      closed,
      resolveClosed,
    };
    this.subs.set(deviceId, sub);

    void this.run(deviceId, organizationId, sub).catch((err) => {
      sub.lastError = err instanceof Error ? err.message : 'Realtime listener crashed';
      logger.error({ err, deviceId }, 'Realtime listener crashed');
      sub.resolveClosed();
      this.subs.delete(deviceId);
    });

    return { status: 'OK' };
  }

  async stop(deviceId: string): Promise<void> {
    const sub = this.subs.get(deviceId);
    if (!sub) return;
    sub.stopped = true;
    sub.abort?.();
    await Promise.race([
      sub.closed,
      delay(3_000),
    ]);
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.subs.keys()].map((id) => this.stop(id)));
  }

  private async run(
    deviceId: string,
    organizationId: string,
    sub: RunningSubscription,
  ): Promise<void> {
    while (!sub.stopped) {
      const row = await loadDeviceRow(this.prisma as never, organizationId, deviceId);
      if (!row) break; // device was deleted
      if (!row.ipAddress) {
        sub.lastError = 'No IP address configured for this terminal';
        break;
      }

      const controller = new AbortController();
      sub.abort = () => controller.abort();

      try {
        const { ended } = await openZkRealtime(
          zkOptions(row),
          (event) => {
            void this.handleEvent(row, event).catch((err) => {
              sub.lastError = err instanceof Error ? err.message : 'Realtime punch handling failed';
              logger.error({ err, deviceId }, 'Realtime punch handling failed');
            });
          },
          { signal: controller.signal, onDrop: (err) => { sub.lastError = err?.message ?? 'ZK realtime socket closed'; } },
        );
        sub.lastError = null;
        await ended; // resolves when the socket drops or the listener is closed
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection dropped';
        sub.lastError = message;
        logger.warn({ err, deviceId }, 'Realtime subscription dropped');
        await this.prisma.biometricDevice.update({
          where: { id: deviceId },
          data: { status: 'OFFLINE' },
        }).catch(() => {});
      }

      if (sub.stopped) break;
      await delay(RECONNECT_DELAY_MS);
    }

    this.subs.delete(deviceId);
    sub.resolveClosed();
  }

  private async handleEvent(
    row: BiometricDeviceRow,
    event: { userId: string; attTime: Date },
  ): Promise<void> {
    const timeZone = row.timeZone;
    // node-zklib emits wall components in the server-local zone; reinterpret
    // them in the organization timezone so the punch lands on the right day.
    const punchTime = naiveToDate(localDateToNaive(event.attTime), timeZone);
    const deviceUserId = event.userId;

    if (!deviceUserId) {
      // No printed user id: store the event as evidence but never attribute
      // it, since device-internal ids are recycled after deletion.
      await ingestPunch(this.prisma, row, timeZone, {
        deviceUserId: `__uid:${Date.now()}`,
        punchTime,
        punchState: 0,
        verifyMode: defaultZkVerifyMode(row.mode),
        source: 'REALTIME',
        rawJson: { engine: 'node-zklib', unattributable: true },
      });
      return;
    }

    const employee = await resolveEmployee(this.prisma, row.organizationId, row.id, deviceUserId);
    const punchDay = naiveStartOfDay(localDateToNaive(event.attTime), timeZone);
    let punchState: 0 | 1 = 0;
    if (employee) {
      const today = await this.prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: punchDay } },
        select: { checkIn: true, checkOut: true },
      });
      // Heuristic: an open check-in means this punch is the way out.
      if (today?.checkIn && !today.checkOut) punchState = 1;
    }

    await ingestPunch(this.prisma, row, timeZone, {
      deviceUserId,
      punchTime,
      punchState,
      verifyMode: defaultZkVerifyMode(row.mode),
      source: 'REALTIME',
      rawJson: { engine: 'node-zklib' },
    });
  }
}

let shared: BiometricRealtimeManager | null = null;

export function createBiometricRealtimeManager(prisma: PrismaClient): BiometricRealtimeManager {
  if (!shared) shared = new BiometricRealtimeManager(prisma);
  return shared;
}