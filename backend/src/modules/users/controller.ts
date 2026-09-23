import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserService } from './service';
import { sendSuccess } from '../../utils/response';
import { contextFromReq } from '../../services/audit';
import { resolveOrgScope } from '../../middleware/guard';
import type { CreateUserInput, UpdateUserInput, ListUsersQuery } from './schema';

export class UserController {
  constructor(private readonly service: UserService) {}

  async list(request: FastifyRequest, reply: FastifyReply, query: ListUsersQuery) {
    const orgId = resolveOrgScope(request, query.organizationId);
    const result = await this.service.list(orgId, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      status: query.status,
      role: query.role,
    });
    return sendSuccess(reply, result);
  }

  async get(request: FastifyRequest, reply: FastifyReply, id: string) {
    const orgId = resolveOrgScope(request);
    const result = await this.service.get(orgId, id);
    return sendSuccess(reply, result);
  }

  async create(request: FastifyRequest, reply: FastifyReply, body: CreateUserInput) {
    const orgId = resolveOrgScope(request);
    const ctx = contextFromReq(request);
    const result = await this.service.create(orgId, body, request.user!.id);
    await request.server.audit.record({
      ...ctx,
      action: 'users.create',
      entity: 'user',
      entityId: result.id,
      newValue: { email: result.email, roles: result.roles.map((r) => r.code) },
    });
    return sendSuccess(reply, result, 'User created successfully');
  }

  async update(request: FastifyRequest, reply: FastifyReply, id: string, body: UpdateUserInput) {
    const orgId = resolveOrgScope(request);
    const ctx = contextFromReq(request);
    const previous = await this.service.get(orgId, id);
    const result = await this.service.update(orgId, id, body, request.user!.id);
    await request.server.audit.record({
      ...ctx,
      action: 'users.update',
      entity: 'user',
      entityId: result.id,
      oldValue: { roles: previous.roles.map((r) => r.code), status: previous.status },
      newValue: { roles: result.roles.map((r) => r.code), status: result.status },
    });
    return sendSuccess(reply, result, 'User updated successfully');
  }

  async delete(request: FastifyRequest, reply: FastifyReply, id: string) {
    const orgId = resolveOrgScope(request);
    const ctx = contextFromReq(request);
    await this.service.delete(orgId, id, request.user!.id);
    await request.server.audit.record({
      ...ctx,
      action: 'users.delete',
      entity: 'user',
      entityId: id,
    });
    return sendSuccess(reply, null, 'User deactivated');
  }
}