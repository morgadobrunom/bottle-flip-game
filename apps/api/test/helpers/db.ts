import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import { seedContent } from '../../src/db/seed-content';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function createTestDb({ seed = true } = {}) {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  const typed = db as unknown as Db;
  const seeded = seed ? await seedContent(typed, { devTokens: 5 }) : null;
  return { db: typed, client, tokens: seeded?.tokens ?? [], close: () => client.close() };
}
