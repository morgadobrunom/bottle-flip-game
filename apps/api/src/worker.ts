/**
 * Background worker. Shares the API schema and providers. Cron times are
 * Africa/Nairobi so leaderboard windows close just after local midnight/hour.
 */
import './instrument';
import * as Sentry from '@sentry/node';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { cleanup } from './jobs/cleanup';
import { closeLeaderboardWindows } from './jobs/close-windows';
import { creditReward } from './jobs/credit-reward';
import { createCreditProvider } from './providers/credit';
import { createSmsProvider } from './providers/sms';
import { JOBS, PgBossQueue, startBoss, type JobPayloads } from './queue';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const db = createDb(pool);
const boss = await startBoss(config.DATABASE_URL);
const queue = new PgBossQueue(boss);
const deps = { db, credit: createCreditProvider(config), sms: createSmsProvider(config) };

const report = (job: string) => (err: unknown) => {
  Sentry.captureException(err, { tags: { job } });
  throw err;
};

await boss.work<JobPayloads['credit-reward']>(JOBS.creditReward, { batchSize: 5 }, async (jobs) => {
  for (const job of jobs) {
    const outcome = await creditReward(deps, job.data.rewardId).catch(report(JOBS.creditReward));
    console.log(`[credit-reward] ${job.data.rewardId} ${outcome}`);
  }
});

await boss.work(JOBS.closeWindows, async () => {
  const closed = await closeLeaderboardWindows(db, queue).catch(report(JOBS.closeWindows));
  if (closed.length) console.log('[close-windows]', JSON.stringify(closed));
});

await boss.work(JOBS.cleanup, async () => {
  const res = await cleanup(db, queue, { runTtlMinutes: config.RUN_TTL_MINUTES }).catch(report(JOBS.cleanup));
  console.log('[cleanup]', JSON.stringify(res));
});

await boss.schedule(JOBS.closeWindows, '5 * * * *', {}, { tz: 'Africa/Nairobi' });
await boss.schedule(JOBS.cleanup, '*/15 * * * *', {});
console.log('[worker] started');

const shutdown = async () => {
  await boss.stop({ graceful: true, wait: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
