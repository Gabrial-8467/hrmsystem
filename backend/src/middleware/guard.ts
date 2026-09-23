import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../utils/errors';

/**
 * Require a specific permission. Super admins and users with a superset role
 * bypass permission checks (authorization is enforced by the role graph, and a
 * superset role already grants everything in its scope).
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new ForbiddenError('Authentication required', 'FORBIDDEN');
    }
    if (request.user.isSuperAdmin) {
      return;
    }
    if (!request.user.permissions.has(permission)) {
      throw new ForbiddenError(
        'You do not have permission to perform this action',
        'PERMISSION_DENIED',
        { required: permission },
      );
    }
  };
}

/** Express-permission variant for use inside controllers/services. */
export function assertCan(request: FastifyRequest, permission: string): void {
  if (!request.user) {
    throw new ForbiddenError('Authentication required', 'FORBIDDEN');
  }
  if (request.user.isSuperAdmin) {
    return;
  }
  if (!request.user.permissions.has(permission)) {
    throw new ForbiddenError(
      'You do not have permission to perform this action',
      'PERMISSION_DENIED',
      { required: permission },
    );
  }
}

/**
 * Require ANY of the given permissions. Used for endpoints that combine an
 * org-wide role and a self-service role (e.g. leave: everyone with either
 * leave.view or leave.create may call, but the handler scopes the data).
 */
export function requireAnyPermission(permissions: readonly string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new ForbiddenError('Authentication required', 'FORBIDDEN');
    }
    if (request.user.isSuperAdmin) {
      return;
    }
    for (const permission of permissions) {
      if (request.user.permissions.has(permission)) {
        return;
      }
    }
    throw new ForbiddenError(
      'You do not have permission to perform this action',
      'PERMISSION_DENIED',
      { required: permissions },
    );
  };
}

/** Enforce that the request is scoped within the user's organization. */
export function assertSameOrganization(request: FastifyRequest, organizationId: string): void {
  const userOrg = request.user?.organizationId;
  if (userOrg && organizationId !== userOrg) {
    throw new ForbiddenError('Cross-organization access denied', 'TENANT_ISOLATION');
  }
}

/**
 * Resolves the tenant scope for a request. Regular users are hard-scoped to
 * their own organization. Platform super admins may optionally target another
 * organization via query/body (used by the platform management module).
 */
export function resolveOrgScope(request: FastifyRequest, requestedOrgId?: string | null): string {
  if (request.user?.isSuperAdmin) {
    return requestedOrgId ?? request.user.organizationId;
  }
  return request.user?.organizationId ?? '';
}