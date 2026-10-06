import { levelFor } from '@bottle-flip/content';
import { maskPhone, type CampaignView, type PlayerView } from '@bottle-flip/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { campaigns, devices, events, players, sessions } from '../db/schema';
import { hashRefreshToken, newRefreshToken, REFRESH_TTL_DAYS } from '../auth/tokens';
import { unauthorized } from '../errors';

export type PlayerRow = typeof players.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;

export function toPlayerView(p: PlayerRow): PlayerView {
  return {
    id: p.id,
    nickname: p.nickname,
    maskedPhone: p.phone ? maskPhone(p.phone) : null,
    verified: p.verifiedAt !== null,
    coins: p.coins,
    bestFlips: p.bestFlips,
    lifetimeFlips: p.lifetimeFlips,
    level: levelFor(p.lifetimeFlips),
    equippedBottleId: p.equippedBottleId,
    equippedBackgroundId: p.equippedBackgroundId,
    sound: p.sound,
  };
}

export function toCampaignView(c: CampaignRow | null): CampaignView | null {
  return c ? { id: c.id, brand: c.brand, name: c.name, timezone: c.timezone, endsAt: c.endsAt.toISOString() } : null;
}

export async function getCampaign(db: Db, id: string): Promise<CampaignRow | null> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return row ?? null;
}

export function campaignIsLive(c: CampaignRow | null, now: Date): c is CampaignRow {
  return !!c && c.active && c.startsAt <= now && now < c.endsAt;
}

export async function getPlayer(db: Db, id: string): Promise<PlayerRow> {
  const [row] = await db.select().from(players).where(eq(players.id, id));
  if (!row || row.mergedInto) throw unauthorized('player_gone');
  return row;
}

export async function createAnonymousPlayer(db: Db, userAgent: string | undefined) {
  return db.transaction(async (tx) => {
    const [player] = await tx.insert(players).values({}).returning();
    const [device] = await tx
      .insert(devices)
      .values({ playerId: player!.id, userAgent: userAgent?.slice(0, 300) })
      .returning();
    return { player: player!, device: device! };
  });
}

export async function createSession(db: Db, playerId: string, deviceId: string) {
  const refreshToken = newRefreshToken();
  const [session] = await db
    .insert(sessions)
    .values({
      playerId,
      deviceId,
      refreshHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    })
    .returning();
  return { session: session!, refreshToken };
}

/** Swaps a refresh token for a new one. The old token stops working immediately. */
export async function rotateSession(db: Db, refreshToken: string) {
  const now = new Date();
  const next = newRefreshToken();
  const [session] = await db
    .update(sessions)
    .set({ refreshHash: hashRefreshToken(next), expiresAt: new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000) })
    .where(and(eq(sessions.refreshHash, hashRefreshToken(refreshToken)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .returning();
  if (!session) return null;
  await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, session.deviceId));
  return { session, refreshToken: next };
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function track(db: Db, playerId: string | null, type: string, props: Record<string, unknown> = {}) {
  try {
    await db.insert(events).values({ playerId, type, props });
  } catch (err) {
    console.error('[events] failed to record', type, err);
  }
}
