import { readFileSync } from 'node:fs';
import { STEP } from '@bottle-flip/engine';
import { playBot } from '../../../packages/engine/test/bot';

// End-to-end check against a running API: anonymous session, verified runs, leaderboard.
// With OTP_LOG_FILE (the API's stdout using the console SMS provider) and SMOKE_TOKEN it
// also verifies a phone, completes the weekly drop and waits for the worker to credit it.
const API = process.env.API_URL ?? 'http://localhost:8080';
const OTP_LOG_FILE = process.env.OTP_LOG_FILE;
const TOKEN = process.env.SMOKE_TOKEN;
const PHONE = process.env.SMOKE_PHONE ?? `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

let accessToken = '';
let cookie = '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  const json = (await res.json()) as T;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function playRun(maxThrows: number) {
  const { runId, seed } = await call<{ runId: string; seed: number }>('POST', '/runs/start');
  const sim = playBot(seed, { jitter: 10, maxThrows });
  const r = sim.result();
  await sleep(r.endTick * STEP * 1000);
  const out = await call<{ flips: number; coinsEarned: number }>('POST', `/runs/${runId}/submit`, {
    inputs: sim.inputs,
    claimed: { flips: r.flips, perfects: r.perfects, endTick: r.endTick },
  });
  console.log(`  run ${runId.slice(0, 8)}: ${out.flips} flips, +${out.coinsEarned} coins`);
}

console.log(`API ${API}`);
console.log('health', await call('GET', '/health'));
const session = await call<{ accessToken: string; player: { id: string } }>('POST', '/sessions/device');
accessToken = session.accessToken;
console.log('anonymous player', session.player.id);

await playRun(2);
await call('POST', '/auth/refresh');
console.log('refresh rotated');

if (OTP_LOG_FILE && TOKEN) {
  console.log('token', await call('GET', `/tokens/${TOKEN}`));
  await call('POST', '/auth/otp/request', { phone: PHONE });
  await sleep(500);
  const codes = [...readFileSync(OTP_LOG_FILE, 'utf8').matchAll(/code is (\d{6})/g)];
  const code = codes.at(-1)?.[1];
  if (!code) throw new Error('No OTP found in log');
  const verified = await call<{ accessToken: string; player: { maskedPhone: string; coins: number }; token: unknown }>(
    'POST',
    '/auth/otp/verify',
    { phone: PHONE, code, token: TOKEN, consent: { brandMarketing: true, copyVersion: 'v1' } },
  );
  accessToken = verified.accessToken;
  console.log('verified', verified.player, verified.token);
  for (let i = 0; i < 4; i++) await playRun(0);

  const claim = await call<{ rewardId: string; unlockedItemIds: string[] }>('POST', '/missions/weekly-data/claim');
  console.log('claimed weekly drop', claim);
  for (let i = 0; i < 30; i++) {
    const reward = await call<{ status: string; description: string }>('GET', `/rewards/${claim.rewardId}`);
    if (reward.status === 'credited' || reward.status === 'failed') {
      console.log('reward', reward);
      break;
    }
    await sleep(1000);
  }
}

console.log('leaderboard', JSON.stringify((await call<{ rows: unknown[] }>('GET', '/leaderboard?period=weekly')).rows.slice(0, 3)));
console.log('SMOKE OK');
