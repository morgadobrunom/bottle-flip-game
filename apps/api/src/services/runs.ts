/**
 * Start a seeded run and submit an input log. The claimed score must match a
 * headless replay; wall-clock time must not be much shorter than simulated time.
 */
import { coinsFor } from '@bottle-flip/content';
import { STEP, replay } from '@bottle-flip/engine';
import type { RunSubmitBody, RunSubmitResponse } from '@bottle-flip/shared';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { newSeed } from '../auth/tokens';
import type { Db } from '../db/client';
import { players, runs } from '../db/schema';
import { AppError, conflict, notFound, tooMany } from '../errors';
import { weeklyGames } from './missions';
import { campaignIsLive, getCampaign, track } from './players';

const MAX_STARTS_PER_MINUTE = 20;

export async function startRun(db: Db, playerId: string, campaignId: string, now = new Date()) {
  const [recent] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.playerId, playerId), gte(runs.startedAt, new Date(now.getTime() - 60_000))));
  if ((recent?.n ?? 0) >= MAX_STARTS_PER_MINUTE) throw tooMany('too_many_runs');
  const campaign = await getCampaign(db, campaignId);
  const [run] = await db
    .insert(runs)
    .values({ playerId, seed: newSeed(), startedAt: now, campaignId: campaignIsLive(campaign, now) ? campaign.id : null })
    .returning({ id: runs.id, seed: runs.seed });
  return { runId: run!.id, seed: run!.seed };
}

export async function submitRun(
  db: Db,
  opts: { playerId: string; runId: string; body: RunSubmitBody; ttlMinutes: number; campaignId: string; now?: Date },
): Promise<RunSubmitResponse> {
  const now = opts.now ?? new Date();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, opts.runId), eq(runs.playerId, opts.playerId)));
  if (!run) throw notFound('unknown_run');
  if (run.status !== 'started') throw conflict('run_already_submitted');

  const reject = async (reason: string) => {
    await db
      .update(runs)
      .set({ status: 'rejected', rejectReason: reason, inputs: opts.body.inputs, submittedAt: now })
      .where(eq(runs.id, run.id));
    await track(db, opts.playerId, 'run_rejected', { runId: run.id, reason });
    return new AppError(422, 'run_rejected', reason);
  };

  const elapsedMs = now.getTime() - run.startedAt.getTime();
  if (elapsedMs > opts.ttlMinutes * 60_000) throw await reject('expired');

  const outcome = replay(run.seed, opts.body.inputs);
  if (!outcome.ok) throw await reject(outcome.error);
  const result = outcome.result;
  const { claimed } = opts.body;
  if (claimed.flips !== result.flips || claimed.perfects !== result.perfects || claimed.endTick !== result.endTick) {
    throw await reject('mismatch');
  }
  const playedMs = result.endTick * STEP * 1000;
  // 15% slack plus 3s for network/tab throttling; anything faster is a speedhack.
  if (elapsedMs < playedMs * 0.85 - 3000) throw await reject('too_fast');

  const coinsEarned = coinsFor(result.flips, result.perfects);
  const updated = await db.transaction(async (tx) => {
    const [before] = await tx.select({ best: players.bestFlips }).from(players).where(eq(players.id, opts.playerId)).for('update');
    await tx
      .update(runs)
      .set({
        status: 'verified',
        inputs: opts.body.inputs,
        flips: result.flips,
        perfects: result.perfects,
        maxStreak: result.maxStreak,
        coins: coinsEarned,
        endTick: result.endTick,
        submittedAt: now,
      })
      .where(eq(runs.id, run.id));
    const [p] = await tx
      .update(players)
      .set({
        coins: sql`${players.coins} + ${coinsEarned}`,
        lifetimeFlips: sql`${players.lifetimeFlips} + ${result.flips}`,
        bestFlips: sql`greatest(${players.bestFlips}, ${result.flips})`,
        updatedAt: now,
      })
      .where(eq(players.id, opts.playerId))
      .returning();
    return { player: p!, previousBest: before?.best ?? 0 };
  });

  await track(db, opts.playerId, 'run_verified', { runId: run.id, flips: result.flips, perfects: result.perfects });
  const campaign = await getCampaign(db, opts.campaignId);
  return {
    flips: result.flips,
    perfects: result.perfects,
    maxStreak: result.maxStreak,
    coinsEarned,
    coins: updated.player.coins,
    bestFlips: updated.player.bestFlips,
    newBest: result.flips > updated.previousBest,
    weeklyGames: campaign ? await weeklyGames(db, opts.playerId, campaign, now) : null,
  };
}
