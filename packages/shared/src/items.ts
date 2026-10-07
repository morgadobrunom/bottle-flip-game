/** Resolves a catalog item to equipped / owned / buy / level-locked / sponsored. */
import type { Background, Bottle } from '@bottle-flip/content';

export type ItemStatus =
  | { status: 'equipped' }
  | { status: 'owned' }
  | { status: 'buy'; cost: number }
  | { status: 'level'; level: number }
  | { status: 'sponsored'; missionId: string };

export interface OwnershipContext {
  ownedIds: ReadonlySet<string>;
  level: number;
  equippedId: string;
}

/**
 * Determines if an item is owned or accessible by the player.
 * Default items are always owned; level-locked items are accessible if the player's level is high enough.
 * @param item - The catalog item (bottle or background).
 * @param ctx - Player ownership context (level and ownedIds).
 * @returns true if the player owns or can access the item.
 */
export function isOwned(item: Bottle | Background, ctx: Omit<OwnershipContext, 'equippedId'>): boolean {
  switch (item.unlock.type) {
    case 'default':
      return true;
    case 'level':
      return ctx.level >= item.unlock.level || ctx.ownedIds.has(item.id);
    default:
      return ctx.ownedIds.has(item.id);
  }
}

/**
 * Determines the UI status of a catalog item for a player.
 * Classifies items as: equipped, owned, buyable (with coin cost), level-locked, or mission-locked.
 *
 * @param item - The catalog item (bottle or background).
 * @param ctx - Complete player ownership context including equipped item and level.
 * @returns ItemStatus object describing the item's availability and cost.
 */
export function itemStatus(item: Bottle | Background, ctx: OwnershipContext): ItemStatus {
  if (item.id === ctx.equippedId) return { status: 'equipped' };
  if (isOwned(item, ctx)) return { status: 'owned' };
  switch (item.unlock.type) {
    case 'coins':
      return { status: 'buy', cost: item.unlock.cost };
    case 'level':
      return { status: 'level', level: item.unlock.level };
    case 'sponsored':
      return { status: 'sponsored', missionId: item.unlock.missionId };
    case 'default':
      return { status: 'owned' };
  }
}
