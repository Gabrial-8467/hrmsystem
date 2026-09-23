import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OrganizationController } from './controller';
import { OrganizationService } from './service';
import {
  createOrganizationBodySchema,
  getOrganizationParamsSchema,
  listOrganizationsQuerySchema,
  updateOrganizationBodySchema,
  updateOwnOrganizationBodySchema,
} from './schema';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

/**
 * Organization routes are split into platform management (super admin) and
 * org-scoped self-service (org admin / any authenticated user).
 */
export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new OrganizationService(app.prisma);
  const controller = new OrganizationController(service);

  // --- Platform management (super admin) ---
  typed.get('/', {
    preHandler: [authenticate, requirePermission('platform.manage')],
    schema: { querystring: listOrganizationsQuerySchema },
  }, (req, reply) => controller.list(req, reply, req.query));

  typed.post('/', {
    preHandler: [authenticate, requirePermission('platform.manage')],
    schema: { body: createOrganizationBodySchema },
  }, (req, reply) => controller.create(req, reply, req.body));

  typed.get('/:id', {
    preHandler: [authenticate, requirePermission('platform.manage')],
    schema: { params: getOrganizationParamsSchema },
  }, (req, reply) => controller.get(req, reply, req.params.id));

  typed.patch('/:id', {
    preHandler: [authenticate, requirePermission('platform.manage')],
    schema: { params: getOrganizationParamsSchema, body: updateOrganizationBodySchema },
  }, (req, reply) => controller.update(req, reply, req.params.id, req.body));

  // --- Org-scoped self-service (static routes win over /:id) ---
  typed.get('/me', {
    preHandler: [authenticate, requirePermission('organization.view')],
  }, (req, reply) => controller.getOwn(req, reply));

  typed.patch('/me', {
    preHandler: [authenticate, requirePermission('organization.update')],
    schema: { body: updateOwnOrganizationBodySchema },
  }, (req, reply) => controller.updateOwn(req, reply, req.body));
}