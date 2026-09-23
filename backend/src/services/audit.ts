import type { PrismaClient } from '@prisma/client';

export interface AuditEntry {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditService {
  record(entry: AuditEntry): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Buffered audit writer. Audit logs are append-only by construction — there is
 * no update/delete path in this service. Entries are flushed to PostgreSQL in
 * batches for performance and durability is bounded by FLUSH_INTERVAL_MS.
 */
export function createAuditService(prisma: PrismaClient): AuditService {
  const buffer: AuditEntry[] = [];
  const FLUSH_INTERVAL_MS = 500;
  const MAX_BUFFER = 500;
  let flushing = false;
  let timer: NodeJS.Timeout | null = null;

  async function flushBuffer(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      const batch = buffer.splice(0, buffer.length);
      if (batch.length === 0) return;
      await prisma.auditLog.createMany({
        data: batch.map((e) => ({
          organizationId: e.organizationId ?? null,
          userId: e.userId ?? null,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId ?? null,
          oldValue: e.oldValue as never,
          newValue: e.newValue as never,
          metadata: e.metadata as never,
          ipAddress: e.ipAddress ?? null,
          userAgent: e.userAgent ?? null,
        })),
      });
    } finally {
      flushing = false;
    }
  }

  function scheduleFlush(): void {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flushBuffer();
    }, FLUSH_INTERVAL_MS);
  }

  return {
    async record(entry: AuditEntry): Promise<void> {
      buffer.push(entry);
      if (buffer.length >= MAX_BUFFER) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        await flushBuffer();
      } else {
        scheduleFlush();
      }
    },
    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flushBuffer();
    },
  };
}

/** Convenience: build an audit context from a Fastify request. */
export function contextFromReq(req: {
  user?: { id: string; organizationId: string } | null;
  ip?: string | null;
  headers?: Record<string, string | string[] | undefined>;
}): Pick<AuditEntry, 'organizationId' | 'userId' | 'ipAddress' | 'userAgent'> {
  const ua = req.headers?.['user-agent'];
  return {
    organizationId: req.user?.organizationId ?? null,
    userId: req.user?.id ?? null,
    ipAddress: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}