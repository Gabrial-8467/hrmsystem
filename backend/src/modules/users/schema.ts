import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';
import { env } from '../../config/env';

export const listUsersQuerySchema = paginationQuerySchema.shape.querystring.extend({
  organizationId: z.string().cuid().optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED']).optional(),
  role: z.string().max(64).optional(),
});

export const getUserParamsSchema = z.object({ id: z.string().cuid() });

export const createUserBodySchema = z.object({
  email: z.email().max(255).transform((v) => v.toLowerCase().trim()),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z
    .string()
    .min(env.PASSWORD_MIN_LENGTH, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`)
    .max(128)
    .optional(),
  title: z.string().max(120).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  roleCodes: z.array(z.string().min(1).max(64)).min(1, 'At least one role is required').max(10),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional().default('ACTIVE'),
});

export const updateUserBodySchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    title: z.string().max(120).optional().nullable(),
    phone: z.string().max(32).optional().nullable(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
    roleCodes: z.array(z.string().min(1).max(64)).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserBodySchema>;
export type UpdateUserInput = z.infer<typeof updateUserBodySchema>;