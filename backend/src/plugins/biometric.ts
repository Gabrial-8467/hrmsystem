import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createBiometricRealtimeManager } from '../services/biometric';

/**
 * Exposes the biometric realtime manager on the Fastify instance and tears it
 * down on close. Realtime listeners are long-lived sockets to LAN terminals,
 * so a clean shutdown matters — otherwise workers hang on open connections.
 */
export default fp(
  async (fastify: FastifyInstance) => {
    fastify.decorate('biometric', createBiometricRealtimeManager(fastify.prisma));

    fastify.addHook('onClose', async () => {
      await fastify.biometric.stopAll();
    });
  },
  { name: 'hrms.biometric', dependencies: ['hrms.database'] },
);