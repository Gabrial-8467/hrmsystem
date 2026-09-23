import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(60),

  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SIGNING_SECRET: z.string().min(16).optional(),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().default(15),
  PASSWORD_MIN_LENGTH: z.coerce.number().default(8),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  UPLOAD_DIR: z.string().default('./storage/uploads'),

  REDIS_URL: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (i) => `  - ${i.path.join('.')}: ${i.message}`,
  );
  console.error('Invalid environment configuration:\n' + issues.join('\n'));
  process.exit(1);
}

export const env: Readonly<Env> = parsed.data as Env;

export function isProd(): boolean {
  return env.NODE_ENV === 'production';
}

export function allowedOrigins(): string[] {
  return env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
}