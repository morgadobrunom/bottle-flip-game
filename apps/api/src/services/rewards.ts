/**
 * Campaign budget: lock the campaign row, enforce daily data cap, unique
 * sourceRef. Must run inside a transaction with the claim.
 */
import { describeReward, rewardCostKes, type Reward } from '@bottle-flip/content';
import { maskPhone, windowFor, type RewardView } from '@bottle-flip/shared';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { campaigns, rewards } from '../db/schema';
import { conflict } from '../errors';

export type RewardRow = typeof rewards.$inferSelect;

export interface IssueRewardInput {
  playerId: string;
  campaignId: string;
  source: 'mission' | 'leaderboard';
  sourceRef: string;
  reward: Extract<Reward, { type: 'data' | 'airtime' }>;
  now?: Date;
}

/**
 * Reserves campaign budget and records a reward to be credited.
 * Must run inside a transaction: the campaign row lock (FOR UPDATE) serializes spending
 * to prevent budget overruns. Enforces daily data cap for mission rewards.
 * Uses unique sourceRef constraint to prevent duplicate rewards from retries.
 *
 * @param tx - Database transaction (caller must have begun transaction).
 * @param input - IssueRewardInput with playerId, campaignId, source, sourceRef, reward details.
 * @returns The inserted reward row for querying status.
 * @throws conflict if budget exhausted, daily cap exceeded, duplicate sourceRef, or campaign not found.
 */
export async function issueReward(tx: Db, input: IssueRewardInput): Promise<RewardRow> {
  const now = input.now ?? new Date();
  const cost = rewardCostKes(input.reward);
  const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, input.campaignId)).for('update');
  if (!campaign) throw conflict('no_campaign');
  if (campaign.spentKes + cost > campaign.rewardBudgetKes) throw conflict('budget_exhausted', 'This campaign has run out of rewards');

  if (input.reward.type === 'data' && input.source === 'mission') {
    const today = windowFor('daily', now, campaign.timezone);
    const todays = await tx
      .select({ reward: rewards.reward })
      .from(rewards)
      .where(
        and(
          eq(rewards.playerId, input.playerId),
          eq(rewards.source, 'mission'),
          ne(rewards.status, 'failed'),
          gte(rewards.createdAt, today.start),
          lt(rewards.createdAt, today.end),
        ),
      );
    const usedMb = todays.reduce((sum, r) => sum + (r.reward.type === 'data' ? r.reward.amountMb : 0), 0);
    if (usedMb + input.reward.amountMb > campaign.dailyCapMb) throw conflict('daily_cap', 'Daily data limit reached, come back tomorrow');
  }

  await tx
    .update(campaigns)
    .set({ spentKes: sql`${campaigns.spentKes} + ${cost}` })
    .where(eq(campaigns.id, campaign.id));
  const [row] = await tx
    .insert(rewards)
    .values({
      playerId: input.playerId,
      campaignId: campaign.id,
      source: input.source,
      sourceRef: input.sourceRef,
      reward: input.reward,
      costKes: cost,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw conflict('already_rewarded');
  return row;
}

/**
 * Refunds campaign budget when a reward fails to credit (e.g., SMS delivery failed).
 * Only refunds rewards with a cost; free rewards (coins, skins) have no effect.
 *
 * @param db - Database connection.
 * @param reward - The reward row to refund.
 */
export async function refundReward(db: Db, reward: RewardRow) {
  if (!reward.campaignId || reward.costKes === 0) return;
  await db
    .update(campaigns)
    .set({ spentKes: sql`greatest(0, ${campaigns.spentKes} - ${reward.costKes})` })
    .where(eq(campaigns.id, reward.campaignId));
}

/**
 * Transforms a reward database row into a view-safe object for API responses.
 * Masks the phone number and includes status, description, and timestamps.
 *
 * @param r - RewardRow from the database.
 * @param phone - E.164 phone number (will be masked), or null for non-phone rewards.
 * @param provider - Provider name (e.g., "Safaricom", "Airtel").
 * @returns RewardView object safe for JSON serialization.
 */
export function toRewardView(r: RewardRow, phone: string | null, provider: string): RewardView {
  return {
    id: r.id,
    status: r.status,
    description: describeReward(r.reward),
    reward: r.reward,
    maskedPhone: phone ? maskPhone(phone) : null,
    provider,
    createdAt: r.createdAt.toISOString(),
    creditedAt: r.creditedAt?.toISOString() ?? null,
  };
}
