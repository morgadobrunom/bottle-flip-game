/** HTTP entrypoint: Sentry, Postgres, pg-boss (enqueue only), listen, SIGTERM. */
import './instrument';
import * as Sentry from '@sentry/node';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { createCreditProvider } from './providers/credit';
import { createSmsProvider } from './providers/sms';
import { PgBossQueue, startBoss } from './queue';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const db = createDb(pool);
const boss = await startBoss(config.DATABASE_URL);

const app = await buildApp({
  db,
  config,
  sms: createSmsProvider(config),
  credit: createCreditProvider(config),
  queue: new PgBossQueue(boss),
});
if (config.SENTRY_DSN) Sentry.setupFastifyErrorHandler(app);

await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await boss.stop({ graceful: true, wait: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
