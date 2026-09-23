import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { ZodTypeProvider, validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { logger } from './utils/logger';
import { registerErrorHandler } from './middleware/error-handler';
import securityPlugin from './plugins/security';
import databasePlugin from './plugins/database';
import biometricPlugin from './plugins/biometric';
import { generateOpaqueToken } from './utils/tokens';

import { authRoutes } from './modules/auth';
import { userRoutes } from './modules/users';
import { roleRoutes } from './modules/roles';
import { organizationRoutes } from './modules/organizations';
import { auditRoutes } from './modules/audit';
import { dashboardRoutes } from './modules/dashboard';
import { employeeRoutes } from './modules/employees';
import { departmentRoutes, branchRoutes } from './modules/departments/routes';
import { designationRoutes } from './modules/designations/routes';
import { attendanceRoutes } from './modules/attendance/routes';
import { admsRoutes } from './modules/attendance/adms-routes';
import { leaveRoutes } from './modules/leave/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { payrollRoutes } from './modules/payroll/routes';
import { recruitmentRoutes } from './modules/recruitment/routes';
import { performanceRoutes } from './modules/performance/routes';
import { operationsRoutes } from './modules/operations/routes';
import { assetRoutes } from './modules/assets/routes';
import { documentRoutes } from './modules/documents/routes';
import { helpdeskRoutes } from './modules/helpdesk/routes';
import { onboardingRoutes } from './modules/onboarding/routes';
import { reportRoutes } from './modules/reports/routes';

import { requirePermission } from './middleware/guard';
import { authenticate } from './middleware/authenticate';
import { sendSuccess } from './utils/response';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // shared structured logger is used instead
    genReqId: () => generateOpaqueToken().slice(0, 12),
    trustProxy: false,
    bodyLimit: 2 * 1024 * 1024, // 2MB JSON bodies
    requestTimeout: 30_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const startedAt = new Date().toISOString();

  app.addHook('onRequest', async (request) => {
    request.log = logger.child({ reqId: request.id });
    (request.raw as { on?: (e: string, cb: (err: Error) => void) => void })?.on?.('error', (err: Error) => {
      request.log?.error?.({ err }, 'Request stream error');
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    const duration = reply.elapsedTime;
    const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';
    request.log[level]({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
    }, 'Request completed');
  });

  await app.register(securityPlugin);
  await app.register(databasePlugin);
  await app.register(biometricPlugin);
  await app.register(multipart, {
    limits: { files: 1, fileSize: 25 * 1024 * 1024, fields: 10 },
    throwFileSizeLimit: true,
  });
  registerErrorHandler(app);

  app.addHook('onClose', async () => {
    await app.audit.flush();
  });

  // --- Health & service info ---
  app.get('/health', async (_req, reply) => {
    const dbHealthy = await checkDatabase(app);
    return sendSuccess(reply, {
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'hrms-backend',
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      database: dbHealthy ? 'ok' : 'unreachable',
      version: '0.1.0',
    });
  });

  app.get('/api/v1', async (_req, reply) => {
    return sendSuccess(reply, {
      service: 'hrms-backend',
      version: '0.1.0',
      api: 'v1',
    });
  });

  // --- Core HRMS Modules ---
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(roleRoutes, { prefix: '/api/v1/roles' });
  await app.register(organizationRoutes, { prefix: '/api/v1/organizations' });
  await app.register(auditRoutes, { prefix: '/api/v1/audit-logs' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(employeeRoutes, { prefix: '/api/v1/employees' });
  await app.register(departmentRoutes, { prefix: '/api/v1/departments' });
  await app.register(branchRoutes, { prefix: '/api/v1/branches' });
  await app.register(designationRoutes, { prefix: '/api/v1/designations' });
  await app.register(attendanceRoutes, { prefix: '/api/v1/attendance' });
  // ZKTeco terminals push punches straight here (vendor-verified ADMS/iClock).
  await app.register(admsRoutes, { prefix: '/iclock' });
  await app.register(leaveRoutes, { prefix: '/api/v1/leave' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(payrollRoutes, { prefix: '/api/v1/payroll' });
  await app.register(recruitmentRoutes, { prefix: '/api/v1/recruitment' });
  await app.register(performanceRoutes, { prefix: '/api/v1/performance' });
  await app.register(operationsRoutes, { prefix: '/api/v1/operations' });
  await app.register(assetRoutes, { prefix: '/api/v1/assets' });
  await app.register(documentRoutes, { prefix: '/api/v1/documents' });
  await app.register(helpdeskRoutes, { prefix: '/api/v1/helpdesk' });
  await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });

  // --- Platform analytics (super admin) ---
  app.get('/api/v1/platform/analytics', {
    preHandler: [authenticate, requirePermission('analytics.view')],
  }, async (request, reply) => {
    void request;
    const [organizations, users, activeOrgs, trialingOrgs, suspendedOrgs] = await Promise.all([
      app.prisma.organization.count(),
      app.prisma.user.count(),
      app.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      app.prisma.organization.count({ where: { status: 'TRIALING' } }),
      app.prisma.organization.count({ where: { status: 'SUSPENDED' } }),
    ]);
    return sendSuccess(reply, {
      organizations: { total: organizations, active: activeOrgs, suspended: suspendedOrgs },
      trialing: trialingOrgs,
      users: { total: users },
      generatedAt: new Date().toISOString(),
    });
  });

  return app;
}

async function checkDatabase(app: FastifyInstance): Promise<boolean> {
  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return false;
  }
}