import ZKLib from 'node-zklib';
import { logger } from '../../utils/logger';

/**
 * Thin adapter around node-zklib (the battle-tested ZK TCP/UDP client) so the
 * rest of the pipeline never touches its quirky public API directly.
 *
 * node-zklib limits vs the previous zkteco-protocol client:
 *  - attendance records carry only { deviceUserId, recordTime } — no verify
 *    mode, no IN/OUT status, so callers infer the punch state themselves;
 *  - the constructor takes no comm key (node-zklib ignores it);
 *  - connections can hang on unroutable LAN IPs, so every connect is guarded
 *    by a watchdog that force-destroys the socket.
 *
 * Most ZK terminals accept a single TCP session at a time, so sync work runs
 * in one session (readZkSyncData) instead of one connection per query.
 */

export interface ZkAdapterOptions {
  ip: string;
  port: number;
  timeoutMs?: number;
  commKey?: number;
}

export interface ZkRawPunch {
  deviceUserId: string;
  recordTime: Date;
}

export interface ZkDeviceLogStats {
  userCounts: number;
  logCounts: number;
  logCapacity: number;
}

export interface ZkSyncResult {
  logs: ZkRawPunch[];
  clockSeconds: number | null;
  stats: ZkDeviceLogStats | null;
  /** Set when a clear-after-sync was requested and the device confirmed it. */
  cleared?: boolean;
}

export interface ZkSyncConfig {
  /** Ask the terminal to clear its attendance buffer after a successful read. */
  clearAfterSync?: boolean;
}

export interface ZkRealtimeHandle {
  ended: Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_ZK_TIMEOUT_MS = 5_000;
const ZK_CMD_GET_TIME = 201;

function buildSession(opts: ZkAdapterOptions): ZKLib {
  const { ip, port } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ZK_TIMEOUT_MS;
  // inport is unused for TCP sessions; node-zklib falls back TCP→UDP on
  // refused connections, which is fine for LAN terminals.
  return new ZKLib(ip, port, timeoutMs, 0);
}

function destroyForcibly(zk: ZKLib, message: string): void {
  try {
    zk.zklibTcp.socket?.destroy(new Error(message));
  } catch {
    // socket already gone
  }
}

async function connectSession(zk: ZKLib, opts: ZkAdapterOptions): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ZK_TIMEOUT_MS;
  const watchdog = setTimeout(() => destroyForcibly(zk, 'ZK terminal did not respond in time'), timeoutMs);
  try {
    await zk.createSocket(() => undefined, () => undefined);
  } catch (err) {
    throw err instanceof Error ? err : new Error('Unable to reach ZK terminal');
  } finally {
    clearTimeout(watchdog);
  }
}

async function teardownSocket(zk: ZKLib | null): Promise<void> {
  if (!zk) return;
  try {
    await zk.disconnect();
  } catch {
    // best-effort
  }
}

async function withSession<T>(
  opts: ZkAdapterOptions,
  fn: (zk: ZKLib) => Promise<T>,
): Promise<T> {
  const zk = buildSession(opts);
  await connectSession(zk, opts);
  try {
    return await fn(zk);
  } finally {
    await teardownSocket(zk);
  }
}

function readRecords(rows: Array<{ deviceUserId?: string; recordTime?: Date }>, since?: Date): ZkRawPunch[] {
  const out: ZkRawPunch[] = [];
  for (const r of rows) {
    if (!r || !r.recordTime || Number.isNaN(r.recordTime.getTime())) continue;
    const deviceUserId = String(r.deviceUserId ?? '').trim();
    if (!deviceUserId) continue;
    if (since && r.recordTime < since) continue;
    out.push({ deviceUserId, recordTime: r.recordTime });
  }
  return out;
}

async function readClockSeconds(zk: ZKLib): Promise<number | null> {
  try {
    const buf = await zk.executeCmd(ZK_CMD_GET_TIME, '');
    if (buf && buf.length >= 4) return buf.readUInt32LE(0);
    return null;
  } catch {
    return null;
  }
}

async function readStats(zk: ZKLib): Promise<ZkDeviceLogStats | null> {
  try {
    const info = await zk.getInfo();
    return {
      userCounts: info.userCounts,
      logCounts: info.logCounts,
      logCapacity: info.logCapacity,
    };
  } catch {
    return null;
  }
}

async function clearAttendanceLog(zk: ZKLib): Promise<boolean> {
  try {
    await zk.clearAttendanceLog();
    return true;
  } catch (err) {
    logger.warn({ err }, 'Could not clear ZK attendance buffer');
    return false;
  }
}

/**
 * One-session sync: clock, free-size stats and the attendance log in a single
 * connection. ZK is strict request/response on one socket, so the calls run
 * sequentially. Clock/stats are best-effort and never fail the sync.
 */
export async function readZkSyncData(
  opts: ZkAdapterOptions,
  since?: Date,
  config?: ZkSyncConfig,
): Promise<ZkSyncResult> {
  return withSession(opts, async (zk) => {
    const clockSeconds = await readClockSeconds(zk);
    const stats = await readStats(zk);
    const { data, err } = await zk.getAttendances();
    if (err) {
      throw err instanceof Error ? err : new Error('Failed to read ZK attendance log');
    }
    // Only clear after the log was actually read, so a failed read never
    // destroys the terminal's buffer.
    const cleared = config?.clearAfterSync ? await clearAttendanceLog(zk) : undefined;
    return { logs: readRecords(data ?? [], since), clockSeconds, stats, cleared };
  });
}

/** Pull the attendance log (whole terminal buffer) for a session-free caller. */
export async function readZkAttendanceLogs(opts: ZkAdapterOptions, since?: Date): Promise<ZkRawPunch[]> {
  return withSession(opts, async (zk) => {
    const { data, err } = await zk.getAttendances();
    if (err) {
      throw err instanceof Error ? err : new Error('Failed to read ZK attendance log');
    }
    return readRecords(data ?? [], since);
  });
}

/** The terminal's wall clock, reported as Unix seconds (naive in device tz). */
export async function readZkDeviceClock(opts: ZkAdapterOptions): Promise<number | null> {
  return withSession(opts, readClockSeconds).catch((err) => {
    logger.warn({ err, ip: opts.ip }, 'Could not read ZK device clock');
    return null;
  });
}

/** Free-size counters the terminal reports (user/log counts, capacity). */
export async function readZkDeviceStats(opts: ZkAdapterOptions): Promise<ZkDeviceLogStats | null> {
  return withSession(opts, readStats).catch((err) => {
    logger.warn({ err, ip: opts.ip }, 'Could not read ZK device info');
    return null;
  });
}

/**
 * Open a realtime attendance subscription. Resolves once REG_EVENT is
 * registered; the returned handle's `ended` promise resolves when the socket
 * drops or `close()` is called. `onDrop` is fired with the diagnostic reason.
 */
export async function openZkRealtime(
  opts: ZkAdapterOptions,
  onEvent: (event: { userId: string; attTime: Date }) => void,
  config?: { signal?: AbortSignal; onDrop?: (err: Error | null) => void },
): Promise<ZkRealtimeHandle> {
  const zk = buildSession(opts);
  const signal = config?.signal;
  let settleEnd: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    settleEnd = resolve;
  });
  let closed = false;
  const markClosed = () => {
    if (closed) return;
    closed = true;
    settleEnd();
  };

  const afterDrop = (err: Error | null) => {
    if (!closed) config?.onDrop?.(err);
    markClosed();
    void teardownSocket(zk);
  };
  const onAbort = () => afterDrop(new Error('ZkSession aborted'));

  if (signal) {
    if (signal.aborted) return Promise.reject(new Error('ZkSession aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await connectSession(zk, opts);
  } catch (err) {
    if (signal) signal.removeEventListener('abort', onAbort);
    throw err;
  }

  const socket = zk.zklibTcp.socket;
  socket?.on('close', () => afterDrop(new Error('ZK realtime socket closed')));
  socket?.on('error', (err) => afterDrop(err));

  try {
    await zk.getRealTimeLogs((event) => {
      if (!closed && event && event.attTime && !Number.isNaN(event.attTime.getTime())) {
        onEvent({ userId: String(event.userId ?? '').trim(), attTime: event.attTime });
      }
    });
  } catch (err) {
    if (signal) signal.removeEventListener('abort', onAbort);
    afterDrop(err instanceof Error ? err : new Error('Unable to start ZK realtime'));
    throw err;
  }

  return {
    ended,
    close: async () => {
      onAbort();
      await ended.catch(() => undefined);
    },
  };
}