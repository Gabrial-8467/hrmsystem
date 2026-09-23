/**
 * Ambient typings for node-zklib (MIT, caobo171).
 *
 * The package ships as plain CommonJS with no bundled types. Only the surface
 * this codebase touches is declared here; the rest of the class is left `any`.
 */
declare module 'node-zklib' {
  export interface ZKAttendanceRecord {
    userSn: number;
    deviceUserId: string;
    recordTime: Date;
    ip: string;
  }

  export interface ZKRealtimeEvent {
    userId: string;
    attTime: Date;
  }

  export interface ZKInfo {
    userCounts: number;
    logCounts: number;
    logCapacity: number;
  }

  export interface ZKSocket {
    on(event: 'data', cb: (data: Buffer) => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    on(event: 'close', cb: (hadError?: boolean) => void): void;
    on(event: 'timeout', cb: () => void): void;
    once?(event: string, cb: (...args: unknown[]) => void): void;
    write(data: Buffer, cb?: (err?: Error | null) => void): void;
    end(cb?: () => void): void;
    destroy(error?: Error): void;
  }

  class ZKLib {
    zklibTcp: { socket: ZKSocket | null };
    constructor(ip: string, port: number, timeout?: number, inport?: number);
    createSocket(cbErr?: (err: Error) => void, cbClose?: (kind: string) => void): Promise<void>;
    getAttendances(cbInProcess?: () => void): Promise<{ data: ZKAttendanceRecord[]; err: Error | null }>;
    getRealTimeLogs(cb?: (event: ZKRealtimeEvent) => void): Promise<void>;
    getInfo(): Promise<ZKInfo>;
    disableDevice(): Promise<void>;
    enableDevice(): Promise<void>;
    disconnect(): Promise<void>;
    freeData(): Promise<void>;
    executeCmd(command: number, data?: string | Buffer): Promise<Buffer>;
  }

  export = ZKLib;
}