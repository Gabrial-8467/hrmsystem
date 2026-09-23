import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
});

const env = envSchema.parse(process.env);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: env.DATABASE_URL,
  },
});