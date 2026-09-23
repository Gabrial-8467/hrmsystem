import { z } from 'zod';

const ROLE_CODE_REGEX = /^[A-Z][A-Z0-9_]{0,31}$/;

export const roleParamsSchema = z.object({ id: z.string().cuid() });

export const createRoleBodySchema = z.object({
  name: z.string().min(2).max(80),
  code: z
    .string()
    .min(2)
    .max(32)
    .transform((v) => v.toUpperCase().trim())
    .refine(
      (v) => ROLE_CODE_REGEX.test(v),
      'Code must be uppercase letters, digits and underscores, starting with a letter (e.g. RECRUITER)',
    ),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string().min(1).max(100)).max(120).default([]),
});

export const updateRoleBodySchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(300).optional().nullable(),
    isActive: z.boolean().optional(),
    permissions: z.array(z.string().min(1).max(100)).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type CreateRoleInput = z.infer<typeof createRoleBodySchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleBodySchema>;