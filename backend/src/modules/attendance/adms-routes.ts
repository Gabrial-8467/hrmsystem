import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import {
  matchAdmsDevice,
  markAdmsDeviceSeen,
  parseAdmsCData,
  ingestAdmsPunches,
} from '../../services/biometric/adms';

/**
 * Public ZKTeco iClock/ADMS endpoints (no auth, plain-text responses).
 *
 * Terminals push attendance/registration here and poll for commands. This is
 * the vendor-verified transport for modern ZK devices; the HRMS JSON envelope
 * must never be used on this channel.
 */
export async function admsRoutes(app: FastifyInstance): Promise<void> {
  // GET /iclock/registry?SN=...&options=... — device asks to register.
  app.get('/registry', async (request: FastifyRequest, reply: FastifyReply) => {
    await handleRegistry(app, request, reply);
  });

  // POST /iclock/registry — devices that post a key=value registry payload.
  app.post('/registry', async (request: FastifyRequest, reply: FastifyReply) => {
    await handleRegistry(app, request, reply);
  });

  // POST /iclock/cdata?SN=...&table=ATTLOG — the punch payload.
  app.post('/cdata', async (request: FastifyRequest, reply: FastifyReply) => {
    await handleCData(app, request, reply);
  });

  // GET /iclock/cdata — a few models poll logs with GET.
  app.get('/cdata', async (request: FastifyRequest, reply: FastifyReply) => {
    await handleCData(app, request, reply);
  });

  // GET /iclock/getrequest — device polls for queued commands.
  app.get('/getrequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    // No remote command queue in this build. Empty body = nothing to run.
    reply.type('text/plain').code(200).send('');
  });

  // POST /iclock/devicecmd — device reports command results (ignored here).
  app.post('/devicecmd', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.type('text/plain').code(200).send('OK');
  });
}

async function handleRegistry(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as { SN?: string };
  const sn = query.SN ?? null;
  const match = await matchAdmsDevice(app.prisma, { sn, remoteIp: request.ip });
  if (match.device) {
    await markAdmsDeviceSeen(app.prisma, match.device, sn);
    logger.info({ sn, matchedBy: match.matchedBy }, 'ADMS device registered');
  } else {
    logger.warn({ sn, ip: request.ip }, 'ADMS registration from unknown device');
  }
  reply.type('text/plain').code(200).send('OK');
}

async function handleCData(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as { SN?: string; table?: string };
  const sn = query.SN ?? null;
  const table = (query.table ?? 'ATTLOG').toUpperCase();
  const body = bodyText(request);

  const match = await matchAdmsDevice(app.prisma, { sn, remoteIp: request.ip });
  if (match.device) {
    await markAdmsDeviceSeen(app.prisma, match.device, sn);

    if (table === 'ATTLOG') {
      const records = parseAdmsCData(body);
      if (records.length > 0) {
        const result = await ingestAdmsPunches(app.prisma, match.device, records);
        logger.info(
          { sn, deviceId: match.device.id, ...result },
          'ADMS attendance push ingested',
        );
      }
    }
  } else {
    logger.warn({ sn, table, ip: request.ip }, 'ADMS cdata from unknown device ignored');
  }

  // Always acknowledge so the terminal clears its internal buffer.
  reply.type('text/plain').code(200).send('OK');
}

function bodyText(request: FastifyRequest): string {
  const body = request.body;
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.payload === 'string') return b.payload;
    return JSON.stringify(body);
  }
  return '';
}