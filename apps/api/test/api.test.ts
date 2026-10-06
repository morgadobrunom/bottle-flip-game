import { coinsFor } from '@bottle-flip/content';
import { STEP } from '@bottle-flip/engine';
import type {
  CatalogResponse,
  ClaimResponse,
  LeaderboardResponse,
  MeResponse,
  MissionsResponse,
  OtpVerifyResponse,
  RewardView,
  RunStartResponse,
  RunSubmitResponse,
  TokenInfoResponse,
} from '@bottle-flip/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { playBot } from '../../../packages/engine/test/bot';
import { campaigns, missionProgress, players } from '../src/db/schema';
import { Client, createTestApp, lastCode, type TestApp } from './helpers/app';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

const advance = (ms: number) => {
  t.clock.now = new Date(t.clock.now.getTime() + ms);
};

async function playRun(c: Client, opts: { tamper?: boolean; instant?: boolean } = {}) {
  const start = await c.call<RunStartResponse>('POST', '/runs/start');
  expect(start.status).toBe(200);
  const sim = playBot(start.body.seed, { jitter: 10, maxThrows: 6 });
  const result = sim.result();
  if (!opts.instant) advance(Math.ceil(result.endTick * STEP * 1000) + 500);
  const claimed = { flips: result.flips + (opts.tamper ? 5 : 0), perfects: result.perfects, endTick: result.endTick };
  const submit = await c.call<RunSubmitResponse>('POST', `/runs/${start.body.runId}/submit`, { inputs: sim.inputs, claimed });
  return { submit, result, runId: start.body.runId };
}

async function verify(c: Client, phone: string, token?: string) {
  advance(60_000);
  const req = await c.call('POST', '/auth/otp/request', { phone });
  expect(req.status).toBe(200);
  const res = await c.call<OtpVerifyResponse>('POST', '/auth/otp/verify', {
    phone,
    code: lastCode(t.sms),
    token,
    consent: { brandMarketing: true, copyVersion: 'v1' },
  });
  if (res.status === 200) c.token = res.body.accessToken;
  return res;
}

describe('sessions', () => {
  it('creates an anonymous player and rotates refresh tokens', async () => {
    const c = new Client(t.app);
    const s = await c.anonymous();
    expect(s.player).toMatchObject({ verified: false, coins: 0, level: 1, equippedBottleId: 'classic' });
    expect(s.campaign?.id).toBe('launch');

    const oldCookie = c.refreshCookie;
    const refreshed = await c.call<MeResponse>('POST', '/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(c.refreshCookie).not.toBe(oldCookie);

    const stale = new Client(t.app);
    stale.refreshCookie = oldCookie;
    expect((await stale.call('POST', '/auth/refresh')).status).toBe(401);
  });

  it('rejects requests without a token', async () => {
    expect((await new Client(t.app).call('GET', '/me')).status).toBe(401);
  });
});

describe('runs', () => {
  it('verifies a replayed run and banks coins', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    const { submit, result } = await playRun(c);
    expect(submit.status).toBe(200);
    expect(submit.body).toMatchObject({
      flips: result.flips,
      perfects: result.perfects,
      coinsEarned: coinsFor(result.flips, result.perfects),
      coins: coinsFor(result.flips, result.perfects),
      newBest: result.flips > 0,
    });
    const me = await c.call<MeResponse>('GET', '/me');
    expect(me.body.player.bestFlips).toBe(result.flips);
  });

  it('rejects a tampered score and refuses resubmission', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    const { submit, runId } = await playRun(c, { tamper: true });
    expect(submit.status).toBe(422);
    expect(submit.body).toMatchObject({ error: 'run_rejected', message: 'mismatch' });
    const again = await c.call('POST', `/runs/${runId}/submit`, { inputs: [], claimed: { flips: 0, perfects: 0, endTick: 0 } });
    expect(again.status).toBe(409);
    expect((await c.call<MeResponse>('GET', '/me')).body.player.coins).toBe(0);
  });

  it('rejects a run submitted faster than it could be played', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    const { submit } = await playRun(c, { instant: true });
    expect(submit.status).toBe(422);
    expect(submit.body).toMatchObject({ message: 'too_fast' });
  });

  it("does not accept another player's run", async () => {
    const a = new Client(t.app);
    const b = new Client(t.app);
    await a.anonymous();
    await b.anonymous();
    const start = await a.call<RunStartResponse>('POST', '/runs/start');
    const res = await b.call('POST', `/runs/${start.body.runId}/submit`, { inputs: [], claimed: { flips: 0, perfects: 0, endTick: 0 } });
    expect(res.status).toBe(404);
  });
});

describe('catalog', () => {
  it('buys and equips items with server-side checks', async () => {
    const c = new Client(t.app);
    const s = await c.anonymous();
    let cat = await c.call<CatalogResponse>('GET', '/catalog');
    expect(cat.body.bottles.map((b) => b.status)).toEqual(['equipped', 'buy', 'sponsored', 'buy', 'buy', 'level']);

    expect((await c.call('POST', '/items/gold/buy')).status).toBe(409);
    await t.db.update(players).set({ coins: 600 }).where(eq(players.id, s.player.id));
    cat = await c.call<CatalogResponse>('POST', '/items/gold/buy');
    expect(cat.status).toBe(200);
    expect(cat.body.coins).toBe(100);
    expect(cat.body.bottles.find((b) => b.item.id === 'gold')?.status).toBe('owned');
    expect((await c.call('POST', '/items/gold/buy')).status).toBe(409);

    const equip = await c.call<MeResponse>('PATCH', '/me', { equippedBottleId: 'gold', nickname: 'Flipper' });
    expect(equip.body.player).toMatchObject({ equippedBottleId: 'gold', nickname: 'Flipper' });
    expect((await c.call('PATCH', '/me', { equippedBottleId: 'neon' })).status).toBe(409);
    expect((await c.call('PATCH', '/me', { coins: 99999 })).status).toBe(400);
  });
});

describe('phone verification', () => {
  it('verifies a number, links a token and keeps progress', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    const { result } = await playRun(c);
    const token = t.tokens[0]!;

    advance(60_000);
    await c.call('POST', '/auth/otp/request', { phone: '0712345312' });
    const wrong = await c.call('POST', '/auth/otp/verify', {
      phone: '0712345312',
      code: lastCode(t.sms) === '000000' ? '111111' : '000000',
      consent: { brandMarketing: false, copyVersion: 'v1' },
    });
    expect(wrong.status).toBe(400);

    const res = await c.call<OtpVerifyResponse>('POST', '/auth/otp/verify', {
      phone: '+254 712 345 312',
      code: lastCode(t.sms),
      token,
      consent: { brandMarketing: true, copyVersion: 'v1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.player).toMatchObject({ verified: true, maskedPhone: '+254 7•• ••• 312', coins: coinsFor(result.flips, result.perfects) });
    expect(res.body.token).toMatchObject({ ok: true });
    expect(res.body.merged).toBe(false);

    const info = await new Client(t.app).call<TokenInfoResponse>('GET', `/tokens/${token}`);
    expect(info.body).toMatchObject({ valid: false, reason: 'redeemed', remaining: t.tokens.length - 1 });
  });

  it('merges a second device into the existing phone account', async () => {
    const first = new Client(t.app);
    await first.anonymous();
    await verify(first, '0722000111');
    const firstRun = await playRun(first);

    const second = new Client(t.app);
    await second.anonymous();
    const secondRun = await playRun(second);
    const res = await verify(second, '0722000111');
    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(true);
    const expected =
      coinsFor(firstRun.result.flips, firstRun.result.perfects) + coinsFor(secondRun.result.flips, secondRun.result.perfects);
    expect(res.body.player.coins).toBe(expected);
    expect(res.body.player.bestFlips).toBe(Math.max(firstRun.result.flips, secondRun.result.flips));
  });

  it('limits code requests and rejects bad numbers', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    expect((await c.call('POST', '/auth/otp/request', { phone: '0201234567' })).status).toBe(400);
    expect((await c.call('POST', '/auth/otp/request', { phone: '0733000222' })).status).toBe(200);
    expect((await c.call('POST', '/auth/otp/request', { phone: '0733000222' })).status).toBe(429);
  });
});

describe('missions and rewards', () => {
  it('completes the weekly drop, issues a reward and unlocks sponsored items', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    await verify(c, '0711222333', t.tokens[1]);
    for (let i = 0; i < 5; i++) expect((await playRun(c)).submit.status).toBe(200);

    const list = await c.call<MissionsResponse>('GET', '/missions');
    const drop = list.body.missions.find((m) => m.id === 'weekly-data')!;
    expect(drop.steps.map((s) => s.done)).toEqual([true, true, true]);
    expect(drop.claimable).toBe(true);

    const claim = await c.call<ClaimResponse>('POST', '/missions/weekly-data/claim');
    expect(claim.status).toBe(200);
    expect(claim.body.unlockedItemIds.sort()).toEqual(['brand-bar', 'brand-can']);
    expect(t.queue.jobs).toEqual([{ name: 'credit-reward', data: { rewardId: claim.body.rewardId } }]);

    const reward = await c.call<RewardView>('GET', `/rewards/${claim.body.rewardId}`);
    expect(reward.body).toMatchObject({ status: 'pending', description: '100 MB data', maskedPhone: '+254 7•• ••• 333' });
    expect((await c.call('POST', '/missions/weekly-data/claim')).status).toBe(409);

    const [campaign] = await t.db.select().from(campaigns);
    expect(campaign!.spentKes).toBe(20);
  });

  it('does not let anonymous players claim verified missions', async () => {
    const c = new Client(t.app);
    await c.anonymous();
    for (let i = 0; i < 5; i++) await playRun(c);
    const list = await c.call<MissionsResponse>('GET', '/missions');
    expect(list.body.missions.find((m) => m.id === 'weekly-data')?.claimable).toBe(false);
    expect((await c.call('POST', '/missions/weekly-data/claim')).status).toBe(409);
  });

  it('rolls back a claim when the campaign budget is spent', async () => {
    const c = new Client(t.app);
    const s = await c.anonymous();
    await verify(c, '0711444555', t.tokens[2]);
    for (let i = 0; i < 5; i++) await playRun(c);
    await t.db.update(campaigns).set({ spentKes: 250_000 });
    const claim = await c.call('POST', '/missions/weekly-data/claim');
    expect(claim.status).toBe(409);
    expect(claim.body).toMatchObject({ error: 'budget_exhausted' });
    expect(await t.db.select().from(missionProgress).where(eq(missionProgress.playerId, s.player.id))).toHaveLength(0);
    expect(t.queue.jobs).toHaveLength(0);
  });
});

describe('leaderboard', () => {
  it('ranks verified players only', async () => {
    const pro = new Client(t.app);
    await pro.anonymous();
    await verify(pro, '0700111222');
    await pro.call('PATCH', '/me', { nickname: 'Pro' });
    const proRun = await playRun(pro);

    const anon = new Client(t.app);
    await anon.anonymous();
    await playRun(anon);

    const board = await pro.call<LeaderboardResponse>('GET', '/leaderboard?period=weekly');
    expect(board.status).toBe(200);
    expect(board.body.rows).toEqual([{ rank: 1, name: 'Pro', flips: proRun.result.flips, you: true }]);
    expect(board.body.you).toMatchObject({ rank: 1, ranked: true });
    expect(board.body.prizes[0]).toEqual({ label: '#1', reward: '2 GB data' });

    const anonView = await anon.call<LeaderboardResponse>('GET', '/leaderboard?period=daily');
    expect(anonView.body.you).toMatchObject({ rank: null, ranked: false });
  });
});
