/**
 * Campaign content contracts. Bottles, backgrounds, missions, and the campaign
 * itself are data, so a new brand activation is a seed change rather than a
 * frontend rewrite. The API stores these as JSONB after validating here.
 */
import { z } from 'zod';

export const ColorSchema = z
  .string()
  .regex(/^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([\d\s.,%]+\))$/, 'Expected a hex or rgb(a) color');

export const ItemIdSchema = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const UnlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('default') }),
  z.object({ type: z.literal('coins'), cost: z.number().int().positive() }),
  z.object({ type: z.literal('level'), level: z.number().int().min(2) }),
  z.object({ type: z.literal('sponsored'), missionId: ItemIdSchema }),
]);

export const BottleSchema = z.object({
  id: ItemIdSchema,
  name: z.string().min(1).max(40),
  unlock: UnlockSchema,
  body: ColorSchema,
  cap: ColorSchema,
  label: ColorSchema,
  stripe: ColorSchema,
  labelText: z.string().max(8).optional(),
});

export const BackgroundSchema = z.object({
  id: ItemIdSchema,
  name: z.string().min(1).max(40),
  unlock: UnlockSchema,
  sky: z.tuple([ColorSchema, ColorSchema, ColorSchema]),
  platform: z.tuple([ColorSchema, ColorSchema]),
  platformTop: ColorSchema,
  perfect: ColorSchema,
  accent: ColorSchema,
});

export const CatalogSchema = z.object({
  bottles: z.array(BottleSchema).min(1),
  backgrounds: z.array(BackgroundSchema).min(1),
});

export const RewardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('data'), amountMb: z.number().int().positive(), costKes: z.number().int().nonnegative() }),
  z.object({ type: z.literal('airtime'), amountKes: z.number().int().positive(), costKes: z.number().int().nonnegative() }),
  z.object({ type: z.literal('coins'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('item'), itemId: ItemIdSchema }),
]);

export const MissionStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play_games'), count: z.number().int().positive() }),
  z.object({ type: z.literal('flips_in_run'), count: z.number().int().positive() }),
  z.object({ type: z.literal('perfect_streak'), count: z.number().int().positive() }),
  z.object({ type: z.literal('play_days_in_row'), count: z.number().int().positive() }),
  z.object({ type: z.literal('redeem_token') }),
  z.object({ type: z.literal('verify_phone') }),
]);

export const MissionPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'once']);

export const MissionSchema = z.object({
  id: ItemIdSchema,
  title: z.string().min(1).max(60),
  kind: z.enum(['drop', 'daily', 'achievement', 'streak']),
  period: MissionPeriodSchema,
  steps: z.array(MissionStepSchema).min(1),
  reward: RewardSchema,
  requiresVerified: z.boolean().default(true),
});

export const LeaderboardPeriodSchema = z.enum(['daily', 'weekly', 'monthly']);

export const PrizeBandSchema = z.object({
  fromRank: z.number().int().positive(),
  toRank: z.number().int().positive(),
  reward: RewardSchema,
});

export const CampaignSchema = z.object({
  id: ItemIdSchema,
  brand: z.string().min(1),
  name: z.string().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  timezone: z.string().default('Africa/Nairobi'),
  rewardBudgetKes: z.number().int().nonnegative(),
  dailyCapMb: z.number().int().nonnegative(),
  prizes: z.record(LeaderboardPeriodSchema, z.array(PrizeBandSchema)),
});

export type Unlock = z.infer<typeof UnlockSchema>;
export type Bottle = z.infer<typeof BottleSchema>;
export type Background = z.infer<typeof BackgroundSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type MissionStep = z.infer<typeof MissionStepSchema>;
export type MissionPeriod = z.infer<typeof MissionPeriodSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type LeaderboardPeriod = z.infer<typeof LeaderboardPeriodSchema>;
export type PrizeBand = z.infer<typeof PrizeBandSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type ItemKind = 'bottle' | 'background';
