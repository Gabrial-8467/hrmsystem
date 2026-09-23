import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../database/client';
import { createAuditService } from '../services/audit';
import { createNotifyService } from '../services/notifications';

/**
 * Registers the Prisma client and shared services on the Fastify instance.
 */
export default fp(
  async (fastify: FastifyInstance) => {
    fastify.decorate('prisma', prisma);
    fastify.decorate('audit', createAuditService(prisma));
    fastify.decorate('notify', createNotifyService(prisma));

    fastify.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  },
  { name: 'hrms.database' },
);