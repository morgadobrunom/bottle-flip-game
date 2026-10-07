/** Under-cap token lookup and one-time redemption onto a verified player. */
import type { TokenInfoResponse, TokenRedeemResult } from '@bottle-flip/shared';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { campaigns, tokens } from '../db/schema';

export function normalizeToken(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export async function tokenInfo(db: Db, rawCode: string, now = new Date()): Promise<TokenInfoResponse> {
  const code = normalizeToken(rawCode);
  const [row] = await db
    .select({ token: tokens, campaign: campaigns })
    .from(tokens)
    .innerJoin(campaigns, eq(campaigns.id, tokens.campaignId))
    .where(eq(tokens.code, code));
  if (!row) return { code, valid: false, reason: 'not_found', validUntil: null, campaign: null, remaining: 0, total: 0 };

  const [totals] = await db.select({ total: count() }).from(tokens).where(eq(tokens.campaignId, row.campaign.id));
  const [left] = await db
    .select({ remaining: count() })
    .from(tokens)
    .where(and(eq(tokens.campaignId, row.campaign.id), isNull(tokens.redeemedAt), gt(tokens.validUntil, now)));
  const reason = row.token.redeemedAt ? 'redeemed' : row.token.validUntil <= now ? 'expired' : null;
  return {
    code,
    valid: reason === null,
    reason,
    validUntil: row.token.validUntil.toISOString(),
    campaign: { brand: row.campaign.brand, name: row.campaign.name, dailyCapMb: row.campaign.dailyCapMb },
    remaining: left?.remaining ?? 0,
    total: totals?.total ?? 0,
  };
}

/** Links a token to a verified player. Runs inside the caller's transaction. */
export async function redeemToken(tx: Db, playerId: string, rawCode: string, now = new Date()): Promise<TokenRedeemResult> {
  const code = normalizeToken(rawCode);
  const [token] = await tx.select().from(tokens).where(eq(tokens.code, code)).for('update');
  if (!token) return { code, ok: false, reason: 'not_found' };
  if (token.redeemedBy === playerId) return { code, ok: true, reason: 'already_yours' };
  if (token.redeemedAt) return { code, ok: false, reason: 'redeemed' };
  if (token.validUntil <= now) return { code, ok: false, reason: 'expired' };
  await tx.update(tokens).set({ redeemedBy: playerId, redeemedAt: now }).where(eq(tokens.code, code));
  return { code, ok: true, reason: null };
}
