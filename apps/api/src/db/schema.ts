/**
 * Drizzle schema for the campaign: identity, catalog, verified runs, tokens,
 * missions, budgeted rewards, and append-only events.
 */
import type { Background, Bottle, Campaign, Mission, Reward } from '@bottle-flip/content';
import type { RunInput } from '@bottle-flip/engine';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const runStatus = pgEnum('run_status', ['started', 'verified', 'rejected', 'abandoned']);
export const rewardStatus = pgEnum('reward_status', ['pending', 'processing', 'credited', 'failed']);
export const itemKind = pgEnum('item_kind', ['bottle', 'background']);

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  nickname: text('nickname'),
  coins: integer('coins').notNull().default(0),
  lifetimeFlips: integer('lifetime_flips').notNull().default(0),
  bestFlips: integer('best_flips').notNull().default(0),
  equippedBottleId: text('equipped_bottle_id').notNull().default('classic'),
  equippedBackgroundId: text('equipped_background_id').notNull().default('night-soda'),
  sound: boolean('sound').notNull().default(true),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  /** Set when this anonymous player was absorbed into a phone-owned account. */
  mergedInto: uuid('merged_into'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    refreshHash: text('refresh_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sessions_refresh_hash_idx').on(t.refreshHash), index('sessions_player_idx').on(t.playerId)],
);

export const otpRequests = pgTable(
  'otp_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_created_idx').on(t.phone, t.createdAt), index('otp_ip_created_idx').on(t.ip, t.createdAt)],
);

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  brand: text('brand').notNull(),
  name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  timezone: text('timezone').notNull().default('Africa/Nairobi'),
  rewardBudgetKes: integer('reward_budget_kes').notNull(),
  spentKes: integer('spent_kes').notNull().default(0),
  dailyCapMb: integer('daily_cap_mb').notNull(),
  prizes: jsonb('prizes').$type<Campaign['prizes']>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').references(() => campaigns.id),
    kind: itemKind('kind').notNull(),
    data: jsonb('data').$type<Bottle | Background>().notNull(),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('catalog_campaign_idx').on(t.campaignId)],
);

export const playerItems = pgTable(
  'player_items',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id),
    source: text('source').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.itemId] })],
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    campaignId: text('campaign_id').references(() => campaigns.id),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    status: runStatus('status').notNull().default('started'),
    /** Client input log; filled on submit so we can audit a verified score. */
    inputs: jsonb('inputs').$type<RunInput[]>(),
    flips: integer('flips'),
    perfects: integer('perfects'),
    maxStreak: integer('max_streak'),
    coins: integer('coins'),
    endTick: integer('end_tick'),
    rejectReason: text('reject_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_player_submitted_idx').on(t.playerId, t.submittedAt),
    index('runs_leaderboard_idx').on(t.status, t.submittedAt, t.flips),
  ],
);

export const tokens = pgTable('tokens', {
  code: text('code').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  redeemedBy: uuid('redeemed_by').references(() => players.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const missions = pgTable('missions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => campaigns.id),
  data: jsonb('data').$type<Mission>().notNull(),
  sort: integer('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const missionProgress = pgTable(
  'mission_progress',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    missionId: text('mission_id')
      .notNull()
      .references(() => missions.id),
    periodKey: text('period_key').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    rewardId: uuid('reward_id'),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.missionId, t.periodKey] })],
);

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    campaignId: text('campaign_id').references(() => campaigns.id),
    source: text('source').notNull(),
    /** Unique with playerId so claiming the same mission window twice is a no-op. */
    sourceRef: text('source_ref').notNull(),
    reward: jsonb('reward').$type<Reward>().notNull(),
    costKes: integer('cost_kes').notNull().default(0),
    status: rewardStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    providerRef: text('provider_ref'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    creditedAt: timestamp('credited_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('rewards_source_ref_idx').on(t.playerId, t.sourceRef), index('rewards_status_idx').on(t.status)],
);

export const leaderboardWindows = pgTable(
  'leaderboard_windows',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    period: text('period').notNull(),
    windowKey: text('window_key').notNull(),
    results: jsonb('results').$type<{ rank: number; playerId: string; flips: number }[]>().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.period, t.windowKey] })],
);

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id),
  phone: text('phone').notNull(),
  kind: text('kind').notNull(),
  granted: boolean('granted').notNull(),
  copyVersion: text('copy_version').notNull(),
  ip: text('ip'),
  createdAt: createdAt(),
});

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    playerId: uuid('player_id'),
    type: text('type').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('events_type_created_idx').on(t.type, t.createdAt)],
);
