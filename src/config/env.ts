import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const DEFAULT_DEV_MONGODB_URI = 'mongodb://127.0.0.1:27017/session_booking';

/**
 * Every configuration value is validated once, at boot. If anything is wrong the
 * process exits immediately with a readable message instead of failing later at
 * request time.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z.string().trim().min(1).optional(),
    CORS_ORIGIN: z.string().trim().min(1).default('*'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  })
  .superRefine((value, ctx) => {
    // Never silently fall back to localhost in production.
    if (value.NODE_ENV === 'production' && !value.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required when NODE_ENV=production',
      });
    }
  })
  .transform((value) => ({
    ...value,
    MONGODB_URI: value.MONGODB_URI ?? DEFAULT_DEV_MONGODB_URI,
  }));

export type Env = z.output<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();
