/**
 * Environment configuration, parsed once at boot (BRD §12.3).
 *
 * The process refuses to start on invalid configuration rather than failing at
 * request time, and an unsafe CORS setting is impossible to deploy rather than
 * merely discouraged (NFR-S-10, NFR-C-01).
 */
import { z } from 'zod';

/** `15m`, `30d` and friends, parsed into seconds at boot. */
function durationSecs(fallback: string) {
  return z
    .string()
    .regex(/^\d+[smhd]$/, 'Expected a duration such as 15m or 30d')
    .default(fallback)
    .transform((value) => {
      const amount = Number(value.slice(0, -1));
      const unit = value.slice(-1);
      const seconds = { s: 1, m: 60, h: 3600, d: 86_400 }[unit] ?? 1;
      return amount * seconds;
    });
}

const originListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1, 'At least one origin must be configured'));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),
    // `silent` exists for tests; everything else is a real pino level.
    LOG_LEVEL: z
      .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    /** NFR-D-05: surfaced on /health so the running version is identifiable. */
    COMMIT_SHA: z.string().default('local'),

    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 characters'),
    JWT_REFRESH_PEPPER: z.string().min(32, 'Use at least 32 characters'),
    ACCESS_TOKEN_TTL: durationSecs('15m'),
    REFRESH_TOKEN_TTL: durationSecs('30d'),
    PASSWORD_RESET_TTL: durationSecs('60m'),

    CORS_ORIGINS: originListSchema,

    R2_ACCOUNT_ID: z.string().default(''),
    R2_ACCESS_KEY_ID: z.string().default(''),
    R2_SECRET_ACCESS_KEY: z.string().default(''),
    R2_BUCKET: z.string().default(''),
    R2_BACKUP_PREFIX: z.string().default('backups/'),
    MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),

    AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
    ADMIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
    GLOBAL_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((env, ctx) => {
    // §12.3: the guard that makes a wildcard origin undeployable.
    if (env.NODE_ENV !== 'development' && env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Wildcard CORS origin is not permitted outside development',
      });
    }
    if (env.NODE_ENV === 'production' && env.COMMIT_SHA === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['COMMIT_SHA'],
        message: 'Production builds must record the deployed commit SHA (NFR-D-05)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface Config extends Env {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  /** NFR-S-04: R2 is optional locally; media degrades to placeholders without it. */
  readonly r2Configured: boolean;
}

export class ConfigError extends Error {
  constructor(issues: readonly z.core.$ZodIssue[]) {
    const detail = issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    super(`Invalid environment configuration:\n${detail}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  // Render injects the deployed commit as RENDER_GIT_COMMIT. Accepting it
  // saves wiring COMMIT_SHA by hand on every deploy, and NFR-D-05 makes the
  // commit non-optional in production.
  const withPlatformDefaults =
    source.COMMIT_SHA || !source.RENDER_GIT_COMMIT
      ? source
      : { ...source, COMMIT_SHA: source.RENDER_GIT_COMMIT };

  const result = envSchema.safeParse(withPlatformDefaults);
  if (!result.success) throw new ConfigError(result.error.issues);

  const env = result.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    r2Configured: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_BUCKET),
  };
}
