import { seedCatalog, seedMissions } from '@bottle-flip/content';
import { describe, expect, it } from 'vitest';
import { catalogItems, missions, tokens } from '../src/db/schema';
import { seedContent } from '../src/db/seed-content';
import { createTestDb } from './helpers/db';

describe('migrations and seed', () => {
  it('applies migrations and seeds idempotently', async () => {
    const t = await createTestDb();
    await seedContent(t.db, { devTokens: 5 });
    const items = await t.db.select().from(catalogItems);
    expect(items).toHaveLength(seedCatalog.bottles.length + seedCatalog.backgrounds.length);
    expect(await t.db.select().from(missions)).toHaveLength(seedMissions.length);
    expect((await t.db.select().from(tokens)).length).toBe(new Set(t.tokens).size);
    await t.close();
  });
});
