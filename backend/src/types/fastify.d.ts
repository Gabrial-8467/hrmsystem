import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AuditService } from '../services/audit';
import type { NotifyService } from '../services/notifications';
import type { BiometricRealtimeManager } from '../services/biometric';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED';
  roles: { id: string; code: string; name: string }[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    audit: AuditService;
    notify: NotifyService;
    biometric: BiometricRealtimeManager;
  }

  interface FastifyRequest {
    /** Set by the authenticate middleware for protected routes. */
    user?: AuthenticatedUser;
    /** True when the user's role set includes a superset (admin) role. */
    isAdmin: boolean;
    /** Cached audit metadata populated by handlers. */
    auditMeta?: {
      action: string;
      entity: string;
      entityId?: string;
      oldValue?: unknown;
      newValue?: unknown;
      metadata?: unknown;
    };
  }
}