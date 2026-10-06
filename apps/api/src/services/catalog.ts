import { levelFor, type Background, type Bottle } from '@bottle-flip/content';
import { isOwned, itemStatus, type CatalogEntry, type CatalogResponse } from '@bottle-flip/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { catalogItems, playerItems, players } from '../db/schema';
import { badRequest, conflict, notFound } from '../errors';
import type { PlayerRow } from './players';

type ItemRow = typeof catalogItems.$inferSelect;

export async function listItems(db: Db): Promise<ItemRow[]> {
  return db.select().from(catalogItems).where(eq(catalogItems.active, true)).orderBy(asc(catalogItems.kind), asc(catalogItems.sort));
}

export async function ownedIds(db: Db, playerId: string): Promise<Set<string>> {
  const rows = await db.select({ id: playerItems.itemId }).from(playerItems).where(eq(playerItems.playerId, playerId));
  return new Set(rows.map((r) => r.id));
}

export async function catalogFor(db: Db, player: PlayerRow): Promise<CatalogResponse> {
  const [items, owned] = await Promise.all([listItems(db), ownedIds(db, player.id)]);
  const level = levelFor(player.lifetimeFlips);
  const bottles: CatalogEntry<Bottle>[] = [];
  const backgrounds: CatalogEntry<Background>[] = [];
  for (const row of items) {
    const equippedId = row.kind === 'bottle' ? player.equippedBottleId : player.equippedBackgroundId;
    const status = itemStatus(row.data, { ownedIds: owned, level, equippedId });
    if (row.kind === 'bottle') bottles.push({ item: row.data as Bottle, ...status });
    else backgrounds.push({ item: row.data as Background, ...status });
  }
  return { bottles, backgrounds, coins: player.coins, level };
}

export async function assertCanEquip(db: Db, player: PlayerRow, itemId: string, kind: 'bottle' | 'background') {
  const [row] = await db.select().from(catalogItems).where(and(eq(catalogItems.id, itemId), eq(catalogItems.kind, kind)));
  if (!row || !row.active) throw badRequest('unknown_item');
  const owned = await ownedIds(db, player.id);
  if (!isOwned(row.data, { ownedIds: owned, level: levelFor(player.lifetimeFlips) })) throw conflict('item_locked');
}

export async function buyItem(db: Db, playerId: string, itemId: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(catalogItems).where(eq(catalogItems.id, itemId));
    if (!item || !item.active) throw notFound('unknown_item');
    if (item.data.unlock.type !== 'coins') throw conflict('not_for_sale');
    const cost = item.data.unlock.cost;

    const [player] = await tx.select().from(players).where(eq(players.id, playerId)).for('update');
    if (!player) throw notFound('player');
    const [already] = await tx
      .select()
      .from(playerItems)
      .where(and(eq(playerItems.playerId, playerId), eq(playerItems.itemId, itemId)));
    if (already) throw conflict('already_owned');
    if (player.coins < cost) throw conflict('not_enough_coins');

    const [updated] = await tx
      .update(players)
      .set({ coins: sql`${players.coins} - ${cost}`, updatedAt: new Date() })
      .where(eq(players.id, playerId))
      .returning();
    await tx.insert(playerItems).values({ playerId, itemId, source: 'coins' });
    return { player: updated!, cost };
  });
}
