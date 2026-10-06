import { maskPhone, normalizeKenyanPhone, type OtpVerifyBody, type TokenRedeemResult } from '@bottle-flip/shared';
import { and, count, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import { hashOtp, newOtpCode, safeEqualHex } from '../auth/tokens';
import type { Db } from '../db/client';
import { consents, devices, otpRequests, playerItems, players, runs, sessions, tokens } from '../db/schema';
import { badRequest, tooMany } from '../errors';
import type { SmsProvider } from '../providers/sms';
import { getPlayer, track, type PlayerRow } from './players';
import { redeemToken } from './tokens';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_RESEND_SECONDS = 45;
export const OTP_MAX_ATTEMPTS = 5;
const MAX_PER_PHONE_10_MIN = 3;
const MAX_PER_IP_HOUR = 10;

export function parsePhone(input: string): string {
  const phone = normalizeKenyanPhone(input);
  if (!phone) throw badRequest('invalid_phone', 'Enter a Kenyan mobile number like 0712 345 678');
  return phone;
}

export async function requestOtp(db: Db, sms: SmsProvider, pepper: string, rawPhone: string, ip: string, now = new Date()) {
  const phone = parsePhone(rawPhone);
  const [latest] = await db
    .select()
    .from(otpRequests)
    .where(eq(otpRequests.phone, phone))
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  if (latest && now.getTime() - latest.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
    throw tooMany('otp_resend_wait', 'Wait a moment before requesting another code');
  }
  const [byPhone] = await db
    .select({ n: count() })
    .from(otpRequests)
    .where(and(eq(otpRequests.phone, phone), gte(otpRequests.createdAt, new Date(now.getTime() - 10 * 60_000))));
  const [byIp] = await db
    .select({ n: count() })
    .from(otpRequests)
    .where(and(eq(otpRequests.ip, ip), gte(otpRequests.createdAt, new Date(now.getTime() - 60 * 60_000))));
  if ((byPhone?.n ?? 0) >= MAX_PER_PHONE_10_MIN || (byIp?.n ?? 0) >= MAX_PER_IP_HOUR) {
    throw tooMany('otp_rate_limited', 'Too many codes requested, try again later');
  }

  const code = newOtpCode();
  await db.insert(otpRequests).values({
    phone,
    codeHash: hashOtp(pepper, phone, code),
    ip,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
  });
  await sms.send(phone, `Your Bottle Flip code is ${code}. It expires in 5 minutes. Don't share it.`);
  return { maskedPhone: maskPhone(phone), resendInSeconds: OTP_RESEND_SECONDS, expiresInSeconds: OTP_TTL_SECONDS };
}

async function checkCode(db: Db, pepper: string, phone: string, code: string, now: Date) {
  const [req] = await db
    .select()
    .from(otpRequests)
    .where(and(eq(otpRequests.phone, phone), isNull(otpRequests.consumedAt), gt(otpRequests.expiresAt, now)))
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  if (!req) throw badRequest('code_expired', 'That code has expired, request a new one');
  if (req.attempts >= OTP_MAX_ATTEMPTS) throw tooMany('too_many_attempts', 'Too many wrong attempts, request a new code');
  if (!safeEqualHex(req.codeHash, hashOtp(pepper, phone, code))) {
    await db
      .update(otpRequests)
      .set({ attempts: sql`${otpRequests.attempts} + 1` })
      .where(eq(otpRequests.id, req.id));
    throw badRequest('invalid_code', 'That code is not right');
  }
  const [consumed] = await db
    .update(otpRequests)
    .set({ consumedAt: now })
    .where(and(eq(otpRequests.id, req.id), isNull(otpRequests.consumedAt)))
    .returning();
  if (!consumed) throw badRequest('code_expired', 'That code has already been used');
}

/** Moves an anonymous player's progress into the phone owner's account. */
async function mergeInto(tx: Db, from: PlayerRow, into: PlayerRow, now: Date) {
  await tx
    .update(players)
    .set({
      coins: sql`${players.coins} + ${from.coins}`,
      lifetimeFlips: sql`${players.lifetimeFlips} + ${from.lifetimeFlips}`,
      bestFlips: sql`greatest(${players.bestFlips}, ${from.bestFlips})`,
      updatedAt: now,
    })
    .where(eq(players.id, into.id));
  const items = await tx.select().from(playerItems).where(eq(playerItems.playerId, from.id));
  if (items.length) {
    await tx
      .insert(playerItems)
      .values(items.map((i) => ({ ...i, playerId: into.id })))
      .onConflictDoNothing();
    await tx.delete(playerItems).where(eq(playerItems.playerId, from.id));
  }
  await tx.update(runs).set({ playerId: into.id }).where(eq(runs.playerId, from.id));
  await tx.update(tokens).set({ redeemedBy: into.id }).where(eq(tokens.redeemedBy, from.id));
  await tx.update(devices).set({ playerId: into.id }).where(eq(devices.playerId, from.id));
  await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.playerId, from.id), isNull(sessions.revokedAt)));
  await tx.update(players).set({ mergedInto: into.id, coins: 0, updatedAt: now }).where(eq(players.id, from.id));
}

export interface VerifyResult {
  player: PlayerRow;
  merged: boolean;
  token: TokenRedeemResult | null;
}

export async function verifyOtp(
  db: Db,
  pepper: string,
  currentPlayerId: string,
  body: OtpVerifyBody,
  ip: string,
  now = new Date(),
): Promise<VerifyResult> {
  const phone = parsePhone(body.phone);
  await checkCode(db, pepper, phone, body.code, now);
  const current = await getPlayer(db, currentPlayerId);

  const result = await db.transaction(async (tx) => {
    const [owner] = await tx.select().from(players).where(eq(players.phone, phone)).for('update');
    let target: PlayerRow;
    let merged = false;
    if (owner && owner.id !== current.id) {
      if (!current.phone) {
        await mergeInto(tx, current, owner, now);
        merged = true;
      }
      target = owner;
    } else if (owner) {
      target = owner;
    } else {
      const [updated] = await tx
        .update(players)
        .set({ phone, verifiedAt: now, updatedAt: now })
        .where(eq(players.id, current.id))
        .returning();
      target = updated!;
    }
    if (!target.verifiedAt) {
      await tx.update(players).set({ verifiedAt: now }).where(eq(players.id, target.id));
    }
    await tx.insert(consents).values({
      playerId: target.id,
      phone,
      kind: 'brand_marketing',
      granted: body.consent.brandMarketing,
      copyVersion: body.consent.copyVersion,
      ip,
    });
    const token = body.token ? await redeemToken(tx, target.id, body.token, now) : null;
    const [fresh] = await tx.select().from(players).where(eq(players.id, target.id));
    return { player: fresh!, merged, token };
  });

  await track(db, result.player.id, 'phone_verified', { merged: result.merged, token: result.token?.ok ?? null });
  return result;
}
