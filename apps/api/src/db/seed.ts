/** CLI: load DATABASE_URL and upsert seed catalog / campaign / missions. */
import { createDb, createPool } from './client';
import { seedContent } from './seed-content';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = createPool(url);
const devTokens = process.env.NODE_ENV === 'production' ? 0 : Number(process.env.SEED_DEV_TOKENS ?? 20);
const out = await seedContent(createDb(pool), { devTokens });
console.log(`Seeded campaign ${out.campaignId}`);
if (out.tokens.length) console.log(`Dev tokens:\n  ${out.tokens.join('\n  ')}`);
await pool.end();
