import { z } from 'zod';
import { env } from '../../config/env';

const email = z
  .email()
  .max(255)
  .transform((v) => v.toLowerCase().trim());

export const loginBodySchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const requestPasswordResetBodySchema = z.object({
  email,
});

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(20),
    password: z
      .string()
      .min(env.PASSWORD_MIN_LENGTH, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`)
      .max(128),
    passwordConfirmation: z.string().min(1),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    message: 'Passwords do not match',
    path: ['passwordConfirmation'],
  });

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(env.PASSWORD_MIN_LENGTH, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`)
      .max(128),
    passwordConfirmation: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.passwordConfirmation, {
    message: 'Passwords do not match',
    path: ['passwordConfirmation'],
  });

export const verifyEmailBodySchema = z.object({
  token: z.string().min(20),
});

export const loginSchema = z.object({ body: loginBodySchema });
export const requestPasswordResetSchema = z.object({ body: requestPasswordResetBodySchema });
export const resetPasswordSchema = z.object({ body: resetPasswordBodySchema });
export const changePasswordSchema = z.object({ body: changePasswordBodySchema });
export const verifyEmailSchema = z.object({ body: verifyEmailBodySchema });

export type LoginInput = z.infer<typeof loginBodySchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetBodySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>['body'];