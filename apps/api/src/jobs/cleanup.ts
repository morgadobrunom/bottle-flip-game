import { and, eq, inArray, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, otpRequests, rewards, runs, sessions } from '../db/schema';
import type { JobQueue } from '../queue';

export const EVENT_RETENTION_DAYS = 400;
const STUCK_REWARD_MINUTES = 10;

export interface CleanupResult {
  otps: number;
  abandonedRuns: number;
  sessions: number;
  events: number;
  requeuedRewards: number;
}

export async function cleanup(db: Db, queue: JobQueue, opts: { runTtlMinutes: number; now?: Date }): Promise<CleanupResult> {
  const now = opts.now ?? new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const otps = await db.delete(otpRequests).where(lt(otpRequests.createdAt, ago(86_400_000))).returning({ id: otpRequests.id });
  const abandoned = await db
    .update(runs)
    .set({ status: 'abandoned' })
    .where(and(eq(runs.status, 'started'), lt(runs.startedAt, ago(opts.runTtlMinutes * 60_000))))
    .returning({ id: runs.id });
  const deadSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, ago(30 * 86_400_000))))
    .returning({ id: sessions.id });
  const oldEvents = await db
    .delete(events)
    .where(lt(events.createdAt, ago(EVENT_RETENTION_DAYS * 86_400_000)))
    .returning({ id: events.id });

  const stuck = await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(inArray(rewards.status, ['pending', 'processing']), lt(rewards.createdAt, ago(STUCK_REWARD_MINUTES * 60_000))));
  for (const r of stuck) await queue.send('credit-reward', { rewardId: r.id });

  return {
    otps: otps.length,
    abandonedRuns: abandoned.length,
    sessions: deadSessions.length,
    events: oldEvents.length,
    requeuedRewards: stuck.length,
  };
}
