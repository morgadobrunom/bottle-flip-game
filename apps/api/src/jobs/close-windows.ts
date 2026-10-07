/** Snapshot closed daily/weekly/monthly boards once, then issue prize-band rewards. */
import type { LeaderboardPeriod } from '@bottle-flip/content';
import { previousWindow } from '@bottle-flip/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { campaigns, leaderboardWindows } from '../db/schema';
import { AppError } from '../errors';
import type { JobQueue } from '../queue';
import { topRanks } from '../services/leaderboard';
import { issueReward } from '../services/rewards';

const PERIODS: LeaderboardPeriod[] = ['daily', 'weekly', 'monthly'];

export interface CloseResult {
  period: LeaderboardPeriod;
  windowKey: string;
  ranked: number;
  rewards: number;
  budgetExhausted: boolean;
}

/** Snapshots the window that just ended for each period and issues prize rewards once. */
export async function closeLeaderboardWindows(db: Db, queue: JobQueue, now = new Date()): Promise<CloseResult[]> {
  const live = await db.select().from(campaigns).where(eq(campaigns.active, true));
  const out: CloseResult[] = [];

  for (const campaign of live) {
    for (const period of PERIODS) {
      const window = previousWindow(period, now, campaign.timezone);
      if (window.end <= campaign.startsAt || window.start >= campaign.endsAt) continue;
      const bands = campaign.prizes[period] ?? [];
      const depth = Math.max(10, ...bands.map((b) => b.toRank));

      const issued: string[] = [];
      let budgetExhausted = false;
      const closed = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(leaderboardWindows)
          .where(and(eq(leaderboardWindows.campaignId, campaign.id), eq(leaderboardWindows.period, period), eq(leaderboardWindows.windowKey, window.key)));
        if (existing) return null;

        const ranks = await topRanks(tx, campaign.id, window, depth);
        await tx.insert(leaderboardWindows).values({
          campaignId: campaign.id,
          period,
          windowKey: window.key,
          results: ranks.map((r) => ({ rank: r.rank, playerId: r.playerId, flips: r.flips })),
          closedAt: now,
        });

        for (const r of ranks) {
          const band = bands.find((b) => r.rank >= b.fromRank && r.rank <= b.toRank);
          if (!band || (band.reward.type !== 'data' && band.reward.type !== 'airtime')) continue;
          try {
            const reward = await tx.transaction((sp) =>
              issueReward(sp, {
                playerId: r.playerId,
                campaignId: campaign.id,
                source: 'leaderboard',
                sourceRef: `leaderboard:${period}:${window.key}`,
                reward: band.reward as Extract<typeof band.reward, { type: 'data' | 'airtime' }>,
                now,
              }),
            );
            issued.push(reward.id);
          } catch (err) {
            if (err instanceof AppError && err.code === 'budget_exhausted') {
              budgetExhausted = true;
              break;
            }
            if (!(err instanceof AppError)) throw err;
          }
        }
        return ranks.length;
      });
      if (closed === null) continue;

      for (const rewardId of issued) {
        await queue.send('credit-reward', { rewardId }).catch((err) => console.error('[queue] credit enqueue failed', err));
      }
      out.push({ period, windowKey: window.key, ranked: closed, rewards: issued.length, budgetExhausted });
    }
  }
  return out;
}
