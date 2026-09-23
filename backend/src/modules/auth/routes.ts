import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AuthController } from './controller';
import { AuthService } from './service';
import {
  changePasswordBodySchema,
  loginBodySchema,
  refreshTokenBodySchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from './schema';
import { authenticate } from '../../middleware/authenticate';

/**
 * Auth routes. Login/refresh are rate-limited more strictly to protect against
 * credential stuffing and token abuse.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new AuthService(app.prisma);
  const controller = new AuthController(service);

  typed.post('/login', {
    schema: { body: loginBodySchema },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, (req, reply) => controller.login(req, reply, req.body));

  typed.post('/refresh', {
    schema: { body: refreshTokenBodySchema },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, (req, reply) => controller.refresh(req, reply, req.body));

  typed.post('/logout', {}, (req, reply) => controller.logout(req, reply));

  typed.post('/request-password-reset', {
    schema: { body: requestPasswordResetBodySchema },
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
  }, (req, reply) => controller.requestPasswordReset(req, reply, req.body));

  typed.post('/reset-password', {
    schema: { body: resetPasswordBodySchema },
  }, (req, reply) => controller.resetPassword(req, reply, req.body));

  typed.post('/verify-email', {
    schema: { body: verifyEmailBodySchema },
  }, (req, reply) => controller.verifyEmail(req, reply, req.body));

  typed.post('/change-password', {
    schema: { body: changePasswordBodySchema },
    preHandler: authenticate,
  }, (req, reply) => controller.changePassword(req, reply, req.body));

  typed.get('/me', {
    preHandler: authenticate,
  }, (req, reply) => controller.me(req, reply));
}