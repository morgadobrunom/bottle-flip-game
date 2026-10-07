/**
 * pg-boss queue. Credit jobs are singleton-keyed on rewardId so retries never
 * double-credit. Tests use MemoryQueue instead of Postgres.
 */
import PgBoss from 'pg-boss';

export const JOBS = {
  creditReward: 'credit-reward',
  closeWindows: 'close-leaderboard-windows',
  cleanup: 'cleanup',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface JobPayloads {
  'credit-reward': { rewardId: string };
  'close-leaderboard-windows': Record<string, never>;
  cleanup: Record<string, never>;
}

export interface JobQueue {
  send<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void>;
}

export class PgBossQueue implements JobQueue {
  constructor(private readonly boss: PgBoss) {}

  async send<N extends JobName>(name: N, data: JobPayloads[N]) {
    const options =
      name === JOBS.creditReward
        ? { retryLimit: 6, retryDelay: 30, retryBackoff: true, singletonKey: (data as JobPayloads['credit-reward']).rewardId }
        : {};
    await this.boss.send(name, data as object, options);
  }
}

export async function startBoss(url: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
  for (const name of Object.values(JOBS)) await boss.createQueue(name);
  return boss;
}

/** Records jobs in memory; used in tests and when the queue is unavailable. */
export class MemoryQueue implements JobQueue {
  readonly jobs: { name: JobName; data: unknown }[] = [];

  async send<N extends JobName>(name: N, data: JobPayloads[N]) {
    this.jobs.push({ name, data });
  }
}
