import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  APP_NAME: z.string().default('Connectly'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/connectly'),
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(16, 'ACCESS_TOKEN_SECRET must be at least 16 characters')
    .default('dev_connectly_access_secret_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c'),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(16, 'REFRESH_TOKEN_SECRET must be at least 16 characters')
    .default('dev_connectly_refresh_secret_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('../uploads_storage'),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_REGION: z.string().optional().default(''),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),
  MAX_MESSAGE_LENGTH: z.coerce.number().default(4000),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024), // 10 MB
  MAX_GROUP_MEMBERS: z.coerce.number().default(100),
  DEFAULT_PAGE_SIZE: z.coerce.number().default(30),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.string().optional().default(''),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('no-reply@connectly.local'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
