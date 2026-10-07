/**
 * Local Postgres without Docker: PGlite (WASM) speaking the wire protocol so
 * node-postgres and pg-boss can connect as if this were a real server.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

// Local Postgres without Docker: PGlite (Postgres compiled to WASM) behind the wire protocol.
// Connect with postgres://postgres@127.0.0.1:5432/postgres. Data persists in ./.pglite.
const dataDir = process.env.PGLITE_DIR ?? '.pglite';
const port = Number(process.env.PGPORT ?? 5432);

const db = await PGlite.create(dataDir);
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 32 });
await server.start();
console.log(`PGlite listening on postgres://postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
