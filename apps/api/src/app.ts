import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { TokenSigner, type AccessClaims } from './auth/tokens';
import { corsOrigins, type Config } from './config';
import type { Db } from './db/client';
import { AppError, unauthorized } from './errors';
import type { CreditProvider } from './providers/credit';
import type { SmsProvider } from './providers/sms';
import type { JobQueue } from './queue';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
import { rewardRoutes } from './routes/rewards';

export interface AppDeps {
  db: Db;
  config: Config;
  sms: SmsProvider;
  credit: Pick<CreditProvider, 'name'>;
  queue: JobQueue;
  now?: () => Date;
}

export interface AppContext extends AppDeps {
  signer: TokenSigner;
  now: () => Date;
  requireAuth: (req: FastifyRequest) => AccessClaims;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessClaims | null;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.config.NODE_ENV === 'test' ? false : { level: deps.config.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  const signer = new TokenSigner(deps.config.JWT_SECRET);
  const ctx: AppContext = {
    ...deps,
    signer,
    now: deps.now ?? (() => new Date()),
    requireAuth: (req) => {
      if (!req.auth) throw unauthorized();
      return req.auth;
    },
  };

  await app.register(cookie);
  await app.register(cors, { origin: corsOrigins(deps.config), credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) req.auth = await signer.verify(header.slice(7));
  });

  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'invalid_request', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.code ?? 'request_error', message: e.message ?? 'Request error' });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.get('/health', async () => {
    await deps.db.execute(sql`select 1`);
    return { ok: true };
  });

  await app.register(authRoutes(ctx));
  await app.register(gameRoutes(ctx));
  await app.register(rewardRoutes(ctx));
  return app;
}
