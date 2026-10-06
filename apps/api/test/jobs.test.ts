import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaigns, leaderboardWindows, otpRequests, players, rewards, runs } from '../src/db/schema';
import { cleanup } from '../src/jobs/cleanup';
import { closeLeaderboardWindows } from '../src/jobs/close-windows';
import { MAX_CREDIT_ATTEMPTS, creditReward } from '../src/jobs/credit-reward';
import { StubCreditProvider } from '../src/providers/credit';
import { ConsoleSms } from '../src/providers/sms';
import { MemoryQueue } from '../src/queue';
import { issueReward } from '../src/services/rewards';
import { createTestDb } from './helpers/db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.close();
});

async function verifiedPlayer(phone: string) {
  const [p] = await t.db.insert(players).values({ phone, verifiedAt: new Date() }).returning();
  return p!;
}

async function pendingReward(playerId: string, ref = 'mission:weekly-data:2026-W41') {
  return t.db.transaction((tx) =>
    issueReward(tx, { playerId, campaignId: 'launch', source: 'mission', sourceRef: ref, reward: { type: 'data', amountMb: 100, costKes: 20 } }),
  );
}

describe('credit-reward', () => {
  it('credits once and confirms by SMS', async () => {
    const p = await verifiedPlayer('+254711000001');
    const r = await pendingReward(p.id);
    const credit = new StubCreditProvider();
    const sms = new ConsoleSms();
    expect(await creditReward({ db: t.db, credit, sms }, r.id)).toBe('credited');
    expect(await creditReward({ db: t.db, credit, sms }, r.id)).toBe('skipped');
    const [row] = await t.db.select().from(rewards).where(eq(rewards.id, r.id));
    expect(row).toMatchObject({ status: 'credited', providerRef: `stub-${r.id}`, attempts: 1 });
    expect(credit.credited.get(r.id)).toEqual({ phone: '+254711000001', kind: 'data', amount: 100 });
    expect(sms.sent).toHaveLength(1);
  });

  it('retries, then fails and refunds the budget', async () => {
    const p = await verifiedPlayer('+254711000002');
    const r = await pendingReward(p.id);
    const credit = new StubCreditProvider(100);
    const deps = { db: t.db, credit, sms: new ConsoleSms() };
    for (let i = 1; i < MAX_CREDIT_ATTEMPTS; i++) await expect(creditReward(deps, r.id)).rejects.toThrow();
    expect(await creditReward(deps, r.id)).toBe('failed');
    const [row] = await t.db.select().from(rewards).where(eq(rewards.id, r.id));
    expect(row?.status).toBe('failed');
    const [c] = await t.db.select().from(campaigns);
    expect(c?.spentKes).toBe(0);
  });

  it('enforces the per-player daily data cap', async () => {
    const p = await verifiedPlayer('+254711000003');
    await pendingReward(p.id, 'mission:a');
    await expect(
      t.db.transaction((tx) =>
        issueReward(tx, { playerId: p.id, campaignId: 'launch', source: 'mission', sourceRef: 'mission:b', reward: { type: 'data', amountMb: 1, costKes: 1 } }),
      ),
    ).rejects.toMatchObject({ code: 'daily_cap' });
  });
});

describe('close-leaderboard-windows', () => {
  it('snapshots last week once and pays prize bands', async () => {
    const lastWeek = new Date('2026-10-08T12:00:00+03:00');
    const now = new Date('2026-10-12T00:10:00+03:00');
    const flips = [30, 22, 15];
    for (const [i, f] of flips.entries()) {
      const p = await verifiedPlayer(`+25472200000${i}`);
      await t.db.insert(runs).values({ playerId: p.id, campaignId: 'launch', seed: i, status: 'verified', flips: f, submittedAt: lastWeek });
    }
    const queue = new MemoryQueue();
    const res = await closeLeaderboardWindows(t.db, queue, now);
    expect(res.find((r) => r.period === 'weekly')).toMatchObject({ windowKey: '2026-W41', ranked: 3, rewards: 3 });

    const again = await closeLeaderboardWindows(t.db, queue, now);
    expect(again.find((r) => r.period === 'weekly')).toBeUndefined();

    const [w] = await t.db.select().from(leaderboardWindows).where(eq(leaderboardWindows.windowKey, '2026-W41'));
    expect(w?.results.map((r) => r.flips)).toEqual([30, 22, 15]);
    const issued = await t.db.select().from(rewards).where(eq(rewards.source, 'leaderboard'));
    expect(issued.map((r) => r.reward.type === 'data' && r.reward.amountMb).sort()).toEqual([2048, 250, 250].sort());
  });
});

describe('cleanup', () => {
  it('expires old OTPs and abandoned runs and requeues stuck rewards', async () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const old = new Date(now.getTime() - 2 * 86_400_000);
    const p = await verifiedPlayer('+254733000001');
    await t.db.insert(otpRequests).values({ phone: p.phone!, codeHash: 'x', expiresAt: old, createdAt: old });
    await t.db.insert(runs).values({ playerId: p.id, seed: 1, startedAt: old });
    const r = await pendingReward(p.id);
    await t.db.update(rewards).set({ createdAt: old }).where(eq(rewards.id, r.id));

    const queue = new MemoryQueue();
    const res = await cleanup(t.db, queue, { runTtlMinutes: 40, now });
    expect(res).toMatchObject({ otps: 1, abandonedRuns: 1, requeuedRewards: 1 });
    expect(queue.jobs).toEqual([{ name: 'credit-reward', data: { rewardId: r.id } }]);
  });
});
