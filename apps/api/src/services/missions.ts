import { describeReward, type Mission, type MissionStep } from '@bottle-flip/content';
import { windowFor, type ClaimResponse, type MissionStepView, type MissionView, type Window } from '@bottle-flip/shared';
import { and, asc, count, eq, gte, lt, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { catalogItems, missionProgress, missions, playerItems, players, runs, tokens } from '../db/schema';
import { conflict, forbidden, notFound } from '../errors';
import type { JobQueue } from '../queue';
import { getPlayer, type CampaignRow, type PlayerRow } from './players';
import { issueReward } from './rewards';

interface WindowStats {
  games: number;
  bestRunFlips: number;
  bestStreak: number;
  tokensRedeemed: number;
}

async function windowStats(db: Db, playerId: string, campaign: CampaignRow, w: Window): Promise<WindowStats> {
  const [r] = await db
    .select({ games: count(), flips: max(runs.flips), streak: max(runs.maxStreak) })
    .from(runs)
    .where(and(eq(runs.playerId, playerId), eq(runs.status, 'verified'), gte(runs.submittedAt, w.start), lt(runs.submittedAt, w.end)));
  const [t] = await db
    .select({ n: count() })
    .from(tokens)
    .where(
      and(eq(tokens.redeemedBy, playerId), eq(tokens.campaignId, campaign.id), gte(tokens.redeemedAt, w.start), lt(tokens.redeemedAt, w.end)),
    );
  return { games: r?.games ?? 0, bestRunFlips: Number(r?.flips ?? 0), bestStreak: Number(r?.streak ?? 0), tokensRedeemed: t?.n ?? 0 };
}

async function longestDayStreak(db: Db, playerId: string, timeZone: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 400 * 86_400_000);
  const rows = await db
    .select({ day: sql<string>`to_char(${runs.submittedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`.as('day') })
    .from(runs)
    .where(and(eq(runs.playerId, playerId), eq(runs.status, 'verified'), gte(runs.submittedAt, since)))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));
  let best = 0;
  let current = 0;
  let prev: number | null = null;
  for (const { day } of rows) {
    const t = Date.parse(`${day}T00:00:00Z`);
    current = prev !== null && t - prev === 86_400_000 ? current + 1 : 1;
    best = Math.max(best, current);
    prev = t;
  }
  return best;
}

function stepView(step: MissionStep, stats: WindowStats, ctx: { verified: boolean; dayStreak: number; brand: string }): MissionStepView {
  const v = (label: string, current: number, target: number) => ({
    type: step.type,
    label,
    current: Math.min(current, target),
    target,
    done: current >= target,
  });
  switch (step.type) {
    case 'play_games':
      return v(`Play ${step.count} games`, stats.games, step.count);
    case 'flips_in_run':
      return v(`Land ${step.count} flips in one run`, stats.bestRunFlips, step.count);
    case 'perfect_streak':
      return v(`${step.count} PERFECT landings in a row`, stats.bestStreak, step.count);
    case 'play_days_in_row':
      return v(`Play ${step.count} days in a row`, ctx.dayStreak, step.count);
    case 'redeem_token':
      return v(`Scan a ${ctx.brand} drink token`, stats.tokensRedeemed, 1);
    case 'verify_phone':
      return v('Verify your phone number', ctx.verified ? 1 : 0, 1);
  }
}

async function evaluate(db: Db, player: PlayerRow, mission: Mission, campaign: CampaignRow, now: Date): Promise<MissionView> {
  const w = windowFor(mission.period, now, campaign.timezone);
  const needsDays = mission.steps.some((s) => s.type === 'play_days_in_row');
  const [stats, dayStreak, claimedRows] = await Promise.all([
    windowStats(db, player.id, campaign, w),
    needsDays ? longestDayStreak(db, player.id, campaign.timezone, now) : Promise.resolve(0),
    db
      .select()
      .from(missionProgress)
      .where(and(eq(missionProgress.playerId, player.id), eq(missionProgress.missionId, mission.id), eq(missionProgress.periodKey, w.key))),
  ]);
  const verified = player.verifiedAt !== null;
  const steps = mission.steps.map((s) => stepView(s, stats, { verified, dayStreak, brand: campaign.brand }));
  const complete = steps.every((s) => s.done);
  const claimed = claimedRows.length > 0;
  return {
    id: mission.id,
    title: mission.title,
    kind: mission.kind,
    period: mission.period,
    periodKey: w.key,
    endsAt: mission.period === 'once' ? null : w.end.toISOString(),
    steps,
    reward: describeReward(mission.reward),
    rewardType: mission.reward.type,
    complete,
    claimed,
    claimable: complete && !claimed && (!mission.requiresVerified || verified),
    requiresVerified: mission.requiresVerified,
  };
}

async function activeMissions(db: Db, campaignId: string): Promise<Mission[]> {
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.active, true), eq(missions.campaignId, campaignId)))
    .orderBy(asc(missions.sort));
  return rows.map((r) => r.data);
}

export async function listMissions(db: Db, player: PlayerRow, campaign: CampaignRow, now = new Date()): Promise<MissionView[]> {
  const list = await activeMissions(db, campaign.id);
  return Promise.all(list.map((m) => evaluate(db, player, m, campaign, now)));
}

export async function weeklyGames(db: Db, playerId: string, campaign: CampaignRow, now = new Date()) {
  const list = await activeMissions(db, campaign.id);
  for (const m of list) {
    const step = m.steps.find((s) => s.type === 'play_games');
    if (m.period === 'weekly' && step && step.type === 'play_games') {
      const stats = await windowStats(db, playerId, campaign, windowFor('weekly', now, campaign.timezone));
      return { current: Math.min(stats.games, step.count), target: step.count };
    }
  }
  return null;
}

export async function claimMission(
  db: Db,
  queue: JobQueue,
  playerId: string,
  missionId: string,
  campaign: CampaignRow,
  now = new Date(),
): Promise<ClaimResponse> {
  const [row] = await db.select().from(missions).where(and(eq(missions.id, missionId), eq(missions.campaignId, campaign.id)));
  if (!row || !row.active) throw notFound('unknown_mission');
  const mission = row.data;
  const player = await getPlayer(db, playerId);
  const view = await evaluate(db, player, mission, campaign, now);
  if (view.claimed) throw conflict('already_claimed');
  if (!view.complete) throw conflict('not_complete');
  if (mission.requiresVerified && !player.verifiedAt) throw forbidden('verify_required');

  const result = await db.transaction(async (tx) => {
    const [progress] = await tx
      .insert(missionProgress)
      .values({ playerId, missionId, periodKey: view.periodKey, claimedAt: now })
      .onConflictDoNothing()
      .returning();
    if (!progress) throw conflict('already_claimed');

    let rewardId: string | null = null;
    const unlocked: string[] = [];
    const reward = mission.reward;
    if (reward.type === 'coins') {
      await tx
        .update(players)
        .set({ coins: sql`${players.coins} + ${reward.amount}`, updatedAt: now })
        .where(eq(players.id, playerId));
    } else if (reward.type === 'item') {
      const [added] = await tx.insert(playerItems).values({ playerId, itemId: reward.itemId, source: 'mission' }).onConflictDoNothing().returning();
      if (added) unlocked.push(reward.itemId);
    } else {
      const issued = await issueReward(tx, {
        playerId,
        campaignId: campaign.id,
        source: 'mission',
        sourceRef: `mission:${mission.id}:${view.periodKey}`,
        reward,
        now,
      });
      rewardId = issued.id;
      await tx
        .update(missionProgress)
        .set({ rewardId })
        .where(and(eq(missionProgress.playerId, playerId), eq(missionProgress.missionId, missionId), eq(missionProgress.periodKey, view.periodKey)));
    }

    const items = await tx.select().from(catalogItems);
    for (const item of items) {
      if (item.data.unlock.type === 'sponsored' && item.data.unlock.missionId === mission.id) {
        const [added] = await tx.insert(playerItems).values({ playerId, itemId: item.id, source: 'sponsored' }).onConflictDoNothing().returning();
        if (added) unlocked.push(item.id);
      }
    }
    const [updated] = await tx.select({ coins: players.coins }).from(players).where(eq(players.id, playerId));
    return { rewardId, unlocked, coins: updated?.coins ?? 0 };
  });

  if (result.rewardId) {
    await queue.send('credit-reward', { rewardId: result.rewardId }).catch((err) => console.error('[queue] credit enqueue failed', err));
  }
  return {
    mission: { ...view, claimed: true, claimable: false },
    rewardId: result.rewardId,
    coins: result.coins,
    unlockedItemIds: result.unlocked,
  };
}