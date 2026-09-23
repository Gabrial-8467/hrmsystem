import 'dotenv/config';
import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { syncPermissionsAndSystemRoles } from './services/permission-sync';

async function main(): Promise<void> {
  const app = await buildApp();

  // Reconcile the permission registry and system roles against the database so
  // permission/role definition changes reach every provisioned organization.
  // Idempotent; safe to run on every boot.
  await syncPermissionsAndSystemRoles(app.prisma);
  logger.info('Permission registry and system roles synced');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exitCode = 1;
    }
    process.exit();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  const address = app.server.address();
  const host = typeof address === 'object' && address ? `${address.address}:${address.port}` : 'unknown';
  logger.info(`HRMS backend running at http://${host} (${env.NODE_ENV})`);
}

void main();