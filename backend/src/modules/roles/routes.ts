import type { FastifyInstance } from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, resolveOrgScope } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';
import { permissionsByModule, SYSTEM_ROLES } from '../../config/permissions';
import { RoleService } from './service';
import { createRoleBodySchema, roleParamsSchema, updateRoleBodySchema } from './schema';
import type { CreateRoleInput, UpdateRoleInput } from './schema';

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new RoleService(app.prisma);

  typed.get('/', {
    preHandler: [authenticate, requirePermission('roles.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = resolveOrgScope(request);
    const roles = await service.list(orgId);
    return sendSuccess(reply, {
      roles,
      systemRoles: SYSTEM_ROLES.filter((s) => s.scope === 'ORGANIZATION').map((s) => s.code),
    });
  });

  typed.get('/permissions', {
    preHandler: [authenticate, requirePermission('roles.view')],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const permissions = await app.prisma.permission.findMany({
      select: { id: true, key: true, module: true, name: true, description: true },
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
    return sendSuccess(reply, {
      permissions,
      grouped: Object.entries(permissionsByModule()).map(([module, items]) => ({
        module,
        permissions: items.map((p) => ({ key: p.key, name: p.name, description: p.description })),
      })),
    });
  });

  typed.get('/:id', {
    preHandler: [authenticate, requirePermission('roles.view')],
    schema: { params: roleParamsSchema },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = resolveOrgScope(request);
    const { id } = roleParamsSchema.parse(request.params);
    const role = await service.get(orgId, id);
    return sendSuccess(reply, role);
  });

  typed.post('/', {
    preHandler: [authenticate, requirePermission('roles.manage')],
    schema: { body: createRoleBodySchema },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = resolveOrgScope(request);
    const role = await service.create(orgId, request.body as CreateRoleInput);
    await app.audit.record({
      ...contextFromReq(request),
      action: 'roles.role_create',
      entity: 'role',
      entityId: role.id,
      newValue: { name: role.name, description: role.description },
    });
    return sendSuccess(reply, role, 'Role created successfully');
  });

  typed.patch('/:id', {
    preHandler: [authenticate, requirePermission('roles.manage')],
    schema: { params: roleParamsSchema, body: updateRoleBodySchema },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = resolveOrgScope(request);
    const { id } = roleParamsSchema.parse(request.params);
    const role = await service.update(orgId, id, request.body as UpdateRoleInput);
    await app.audit.record({
      ...contextFromReq(request),
      action: 'roles.role_update',
      entity: 'role',
      entityId: id,
      newValue: { name: role.name, description: role.description },
    });
    return sendSuccess(reply, role, 'Role updated successfully');
  });

  typed.delete('/:id', {
    preHandler: [authenticate, requirePermission('roles.manage')],
    schema: { params: roleParamsSchema },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = resolveOrgScope(request);
    const { id } = roleParamsSchema.parse(request.params);
    await service.remove(orgId, id);
    await app.audit.record({
      ...contextFromReq(request),
      action: 'roles.role_delete',
      entity: 'role',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Role deleted successfully');
  });
}