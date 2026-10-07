/** Apply Drizzle SQL migrations from ./drizzle (or MIGRATIONS_DIR). */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from './client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = createPool(url);
const migrationsFolder = path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
await migrate(drizzle(pool), { migrationsFolder });
console.log(`Migrations applied from ${migrationsFolder}`);
await pool.end();
