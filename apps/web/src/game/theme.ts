import { DEFAULT_BACKGROUND_ID, DEFAULT_BOTTLE_ID, seedBackgrounds, seedBottles, type Background, type Bottle } from '@bottle-flip/content';
import type { CatalogResponse, PlayerView } from '@bottle-flip/shared';
import type { Theme } from '@bottle-flip/engine/render';
import { loadTheme } from '../state/cache';

const fallbackBottle = seedBottles.find((b) => b.id === DEFAULT_BOTTLE_ID)!;
const fallbackBackground = seedBackgrounds.find((b) => b.id === DEFAULT_BACKGROUND_ID)!;

export const defaultTheme: Theme = { bottle: fallbackBottle, background: fallbackBackground };

/** Picks the equipped skins from the live catalog, then the last cached theme, then the defaults. */
export function resolveTheme(player: PlayerView | undefined, catalog: CatalogResponse | undefined): Theme {
  const cached = loadTheme();
  const bottleId = player?.equippedBottleId ?? cached?.bottle.id ?? DEFAULT_BOTTLE_ID;
  const backgroundId = player?.equippedBackgroundId ?? cached?.background.id ?? DEFAULT_BACKGROUND_ID;
  const bottle: Bottle =
    catalog?.bottles.find((e) => e.item.id === bottleId)?.item ??
    (cached?.bottle.id === bottleId ? cached.bottle : undefined) ??
    seedBottles.find((b) => b.id === bottleId) ??
    fallbackBottle;
  const background: Background =
    catalog?.backgrounds.find((e) => e.item.id === backgroundId)?.item ??
    (cached?.background.id === backgroundId ? cached.background : undefined) ??
    seedBackgrounds.find((b) => b.id === backgroundId) ??
    fallbackBackground;
  return { bottle, background };
}
