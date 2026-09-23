import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const listOrganizationsQuerySchema = paginationQuerySchema.shape.querystring.extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TRIALING', 'CANCELLED']).optional(),
  plan: z.enum(['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
});

export const getOrganizationParamsSchema = z.object({ id: z.string().cuid() });

export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug must be lowercase letters, numbers and hyphens'),
  adminEmail: z.email().max(255),
  adminFirstName: z.string().min(1).max(100),
  plan: z.enum(['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
});

export const updateOrganizationBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'TRIALING', 'CANCELLED']).optional(),
    plan: z.enum(['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
    logoUrl: z.string().url().nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    phone: z.string().max(32).nullable().optional(),
    email: z.string().email().nullable().optional(),
    website: z.string().url().nullable().optional(),
    timezone: z.string().max(64).optional(),
    currency: z.string().length(3).optional(),
    dateFormat: z.string().max(16).optional(),
    maxUsers: z.coerce.number().int().min(1).max(1_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const updateOwnOrganizationBodySchema = z
  .object({
    logoUrl: z.string().url().nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    phone: z.string().max(32).nullable().optional(),
    email: z.string().email().nullable().optional(),
    website: z.string().url().nullable().optional(),
    timezone: z.string().max(64).optional(),
    currency: z.string().length(3).optional(),
    dateFormat: z.string().max(16).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationBodySchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationBodySchema>;