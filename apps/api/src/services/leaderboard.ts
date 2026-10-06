import { describeReward, type LeaderboardPeriod } from '@bottle-flip/content';
import { maskPhone, windowFor, type LeaderboardResponse, type Window } from '@bottle-flip/shared';
import { and, asc, count, desc, eq, gt, gte, isNotNull, lt, max, min, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players, runs } from '../db/schema';
import type { CampaignRow, PlayerRow } from './players';

export interface RankedPlayer {
  rank: number;
  playerId: string;
  flips: number;
  name: string;
}

function bestPerPlayer(db: Db, campaignId: string, window: Window) {
  return db
    .select({
      playerId: runs.playerId,
      flips: max(runs.flips).as('window_flips'),
      firstAt: min(runs.submittedAt).as('window_first_at'),
    })
    .from(runs)
    .innerJoin(players, eq(players.id, runs.playerId))
    .where(
      and(
        eq(runs.status, 'verified'),
        eq(runs.campaignId, campaignId),
        gte(runs.submittedAt, window.start),
        lt(runs.submittedAt, window.end),
        isNotNull(players.verifiedAt),
        gt(runs.flips, 0),
      ),
    )
    .groupBy(runs.playerId)
    .as('best');
}

export async function topRanks(db: Db, campaignId: string, window: Window, limit: number): Promise<RankedPlayer[]> {
  const best = bestPerPlayer(db, campaignId, window);
  const rows = await db
    .select({ playerId: best.playerId, flips: best.flips, nickname: players.nickname, phone: players.phone })
    .from(best)
    .innerJoin(players, eq(players.id, best.playerId))
    .orderBy(desc(best.flips), asc(best.firstAt))
    .limit(limit);
  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    flips: Number(r.flips ?? 0),
    name: r.nickname ?? (r.phone ? maskPhone(r.phone) : 'Player'),
  }));
}

async function rankOf(db: Db, campaignId: string, window: Window, playerId: string) {
  const best = bestPerPlayer(db, campaignId, window);
  const [mine] = await db.select().from(best).where(eq(best.playerId, playerId));
  if (!mine?.flips) return null;
  const [ahead] = await db
    .select({ n: count() })
    .from(best)
    .where(or(gt(best.flips, mine.flips), and(eq(best.flips, mine.flips), sql`${best.firstAt} < ${mine.firstAt}`)));
  return { rank: (ahead?.n ?? 0) + 1, flips: Number(mine.flips) };
}

export async function leaderboard(
  db: Db,
  campaign: CampaignRow,
  period: LeaderboardPeriod,
  player: PlayerRow,
  now = new Date(),
): Promise<LeaderboardResponse> {
  const window = windowFor(period, now, campaign.timezone);
  const [rows, mine] = await Promise.all([topRanks(db, campaign.id, window, 100), rankOf(db, campaign.id, window, player.id)]);
  const bands = campaign.prizes[period] ?? [];
  return {
    period,
    windowKey: window.key,
    resetsAt: window.end.toISOString(),
    rows: rows.map((r) => ({ rank: r.rank, name: r.name, flips: r.flips, you: r.playerId === player.id })),
    you: { rank: mine?.rank ?? null, flips: mine?.flips ?? 0, ranked: player.verifiedAt !== null },
    prizes: bands.map((b) => ({
      label: b.fromRank === b.toRank ? `#${b.fromRank}` : `#${b.fromRank}–${b.toRank}`,
      reward: describeReward(b.reward),
    })),
  };
}
