import type { FastifyReply, FastifyRequest } from 'fastify';
import { OrganizationService } from './service';
import { sendSuccess } from '../../utils/response';
import { contextFromReq } from '../../services/audit';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  UpdateOrganizationInput,
} from './schema';

type OwnUpdateInput = Omit<
  UpdateOrganizationInput,
  'name' | 'status' | 'plan' | 'maxUsers'
>;

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  async list(_request: FastifyRequest, reply: FastifyReply, query: ListOrganizationsQuery) {
    const result = await this.service.list({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      plan: query.plan,
    });
    return sendSuccess(reply, result);
  }

  async get(_request: FastifyRequest, reply: FastifyReply, id: string) {
    const result = await this.service.get(id);
    return sendSuccess(reply, result);
  }

  async getOwn(request: FastifyRequest, reply: FastifyReply) {
    const result = await this.service.getOwn(request.user!.organizationId);
    return sendSuccess(reply, result);
  }

  async create(request: FastifyRequest, reply: FastifyReply, body: CreateOrganizationInput) {
    const ctx = contextFromReq(request);
    const result = await this.service.create(body);
    await request.server.audit.record({
      ...ctx,
      action: 'organization.create',
      entity: 'organization',
      entityId: result.organizationId,
      newValue: { name: body.name, slug: body.slug },
    });
    return sendSuccess(reply, result, 'Organization provisioned successfully');
  }

  async update(request: FastifyRequest, reply: FastifyReply, id: string, body: UpdateOrganizationInput) {
    const ctx = contextFromReq(request);
    const previous = await this.service.getOwn(id);
    const result = await this.service.update(id, body);
    await request.server.audit.record({
      ...ctx,
      action: 'organization.update',
      entity: 'organization',
      entityId: id,
      oldValue: { status: previous.status, plan: previous.plan, name: previous.name },
      newValue: { status: result.status, plan: result.plan, name: result.name },
    });
    return sendSuccess(reply, result, 'Organization updated successfully');
  }

  async updateOwn(request: FastifyRequest, reply: FastifyReply, body: OwnUpdateInput) {
    const ctx = contextFromReq(request);
    const result = await this.service.updateOwn(request.user!.organizationId, body);
    await request.server.audit.record({
      ...ctx,
      action: 'organization.update_settings',
      entity: 'organization',
      entityId: request.user!.organizationId,
      newValue: body,
    });
    return sendSuccess(reply, result, 'Organization settings updated');
  }
}