import { describeReward } from '@bottle-flip/content';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players, rewards } from '../db/schema';
import type { CreditProvider } from '../providers/credit';
import type { SmsProvider } from '../providers/sms';
import { refundReward } from '../services/rewards';

export const MAX_CREDIT_ATTEMPTS = 6;

export interface CreditDeps {
  db: Db;
  credit: CreditProvider;
  sms: SmsProvider;
}

export type CreditOutcome = 'credited' | 'skipped' | 'failed' | 'retry';

/**
 * Credits one reward. Throws on a retryable failure so pg-boss retries with backoff;
 * after MAX_CREDIT_ATTEMPTS the reward is marked failed and its budget is refunded.
 */
export async function creditReward(deps: CreditDeps, rewardId: string): Promise<CreditOutcome> {
  const { db } = deps;
  const [claimed] = await db
    .update(rewards)
    .set({ status: 'processing', attempts: sql`${rewards.attempts} + 1` })
    .where(and(eq(rewards.id, rewardId), inArray(rewards.status, ['pending', 'processing'])))
    .returning();
  if (!claimed) return 'skipped';

  const [player] = await db.select().from(players).where(eq(players.id, claimed.playerId));
  const phone = player?.phone;
  const reward = claimed.reward;
  try {
    if (!phone) throw new Error('Player has no verified phone');
    let providerRef: string;
    if (reward.type === 'data') providerRef = (await deps.credit.creditData(phone, reward.amountMb, claimed.id)).providerRef;
    else if (reward.type === 'airtime') providerRef = (await deps.credit.creditAirtime(phone, reward.amountKes, claimed.id)).providerRef;
    else throw new Error(`Reward type ${reward.type} is not credited externally`);

    await db
      .update(rewards)
      .set({ status: 'credited', providerRef, creditedAt: new Date(), lastError: null })
      .where(eq(rewards.id, claimed.id));
    await deps.sms
      .send(phone, `Bottle Flip: ${describeReward(reward)} has been credited to your line. Keep flipping!`)
      .catch((err) => console.error('[credit] confirmation SMS failed', err));
    return 'credited';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = claimed.attempts >= MAX_CREDIT_ATTEMPTS || !phone;
    await db
      .update(rewards)
      .set({ status: exhausted ? 'failed' : 'pending', lastError: message.slice(0, 500) })
      .where(eq(rewards.id, claimed.id));
    if (exhausted) {
      await refundReward(db, claimed);
      return 'failed';
    }
    throw err;
  }
}
