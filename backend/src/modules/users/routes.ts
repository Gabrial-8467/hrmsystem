import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UserController } from './controller';
import { UserService } from './service';
import {
  createUserBodySchema,
  getUserParamsSchema,
  listUsersQuerySchema,
  updateUserBodySchema,
} from './schema';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new UserService(app.prisma);
  const controller = new UserController(service);

  typed.get('/', {
    preHandler: [authenticate, requirePermission('users.view')],
    schema: { querystring: listUsersQuerySchema },
  }, (req, reply) => controller.list(req, reply, req.query));

  typed.post('/', {
    preHandler: [authenticate, requirePermission('users.create')],
    schema: { body: createUserBodySchema },
  }, (req, reply) => controller.create(req, reply, req.body));

  typed.get('/:id', {
    preHandler: [authenticate, requirePermission('users.view')],
    schema: { params: getUserParamsSchema },
  }, (req, reply) => controller.get(req, reply, req.params.id));

  typed.patch('/:id', {
    preHandler: [authenticate, requirePermission('users.update')],
    schema: { params: getUserParamsSchema, body: updateUserBodySchema },
  }, (req, reply) => controller.update(req, reply, req.params.id, req.body));

  typed.delete('/:id', {
    preHandler: [authenticate, requirePermission('users.delete')],
    schema: { params: getUserParamsSchema },
  }, (req, reply) => controller.delete(req, reply, req.params.id));
}