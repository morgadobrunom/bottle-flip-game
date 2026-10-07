/**
 * Process env for the API and worker. Staging/production refuse the baked-in
 * JWT_SECRET / OTP_PEPPER and require secure cookies.
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production', 'test']).default('local'),
    PORT: z.coerce.number().int().default(8080),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1).default('postgres://bottleflip:bottleflip@localhost:5432/bottleflip'),
    JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret'),
    OTP_PEPPER: z.string().min(16).default('dev-only-otp-pepper'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    COOKIE_SECURE: bool.default(false),
    COOKIE_DOMAIN: z.string().optional(),
    CAMPAIGN_ID: z.string().default('launch'),
    SMS_PROVIDER: z.enum(['console', 'africastalking']).default('console'),
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_SENDER_ID: z.string().optional(),
    CREDIT_PROVIDER: z.enum(['stub']).default('stub'),
    SENTRY_DSN: z.string().optional(),
    RUN_TTL_MINUTES: z.coerce.number().int().positive().default(40),
  })
  .superRefine((c, ctx) => {
    if (c.APP_ENV === 'production' || c.APP_ENV === 'staging') {
      if (c.JWT_SECRET.startsWith('dev-only')) ctx.addIssue({ code: 'custom', message: 'JWT_SECRET must be set', path: ['JWT_SECRET'] });
      if (c.OTP_PEPPER.startsWith('dev-only')) ctx.addIssue({ code: 'custom', message: 'OTP_PEPPER must be set', path: ['OTP_PEPPER'] });
      if (!c.COOKIE_SECURE) ctx.addIssue({ code: 'custom', message: 'COOKIE_SECURE must be true', path: ['COOKIE_SECURE'] });
    }
    if (c.SMS_PROVIDER === 'africastalking' && (!c.AT_USERNAME || !c.AT_API_KEY)) {
      ctx.addIssue({ code: 'custom', message: 'AT_USERNAME and AT_API_KEY are required', path: ['SMS_PROVIDER'] });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return ConfigSchema.parse(env);
}

export function corsOrigins(config: Config): string[] {
  return config.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
