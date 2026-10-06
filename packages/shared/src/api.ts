import type { Background, Bottle, LeaderboardPeriod, Mission, MissionStep, Reward } from '@bottle-flip/content';
import { z } from 'zod';
import type { ItemStatus } from './items';

export const NicknameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 _-]{2,20}$/, 'Use 2-20 letters, numbers, spaces, - or _');

export const OtpRequestBody = z.object({ phone: z.string().min(9).max(16) });

export const OtpVerifyBody = z.object({
  phone: z.string().min(9).max(16),
  code: z.string().regex(/^\d{6}$/),
  token: z.string().trim().max(20).optional(),
  consent: z.object({ brandMarketing: z.boolean(), copyVersion: z.string().max(20) }),
});

export const PatchMeBody = z
  .object({
    nickname: NicknameSchema.optional(),
    equippedBottleId: z.string().max(40).optional(),
    equippedBackgroundId: z.string().max(40).optional(),
    sound: z.boolean().optional(),
  })
  .strict();

export const RunInputSchema = z.object({ tick: z.number().int().nonnegative(), type: z.enum(['down', 'up']) });

export const RunSubmitBody = z.object({
  inputs: z.array(RunInputSchema).max(4000),
  claimed: z.object({
    flips: z.number().int().nonnegative(),
    perfects: z.number().int().nonnegative(),
    endTick: z.number().int().nonnegative(),
  }),
});

export const LeaderboardQuery = z.object({ period: z.enum(['daily', 'weekly', 'monthly']).default('weekly') });

export type OtpRequestBody = z.infer<typeof OtpRequestBody>;
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;
export type PatchMeBody = z.infer<typeof PatchMeBody>;
export type RunSubmitBody = z.infer<typeof RunSubmitBody>;

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface PlayerView {
  id: string;
  nickname: string | null;
  maskedPhone: string | null;
  verified: boolean;
  coins: number;
  bestFlips: number;
  lifetimeFlips: number;
  level: number;
  equippedBottleId: string;
  equippedBackgroundId: string;
  sound: boolean;
}

export interface CampaignView {
  id: string;
  brand: string;
  name: string;
  timezone: string;
  endsAt: string;
}

export interface MeResponse {
  player: PlayerView;
  campaign: CampaignView | null;
}

export interface SessionResponse extends MeResponse {
  accessToken: string;
}

export interface OtpRequestResponse {
  maskedPhone: string;
  resendInSeconds: number;
  expiresInSeconds: number;
}

export interface OtpVerifyResponse extends SessionResponse {
  merged: boolean;
  token: TokenRedeemResult | null;
}

export type CatalogEntry<T> = { item: T } & ItemStatus;

export interface CatalogResponse {
  bottles: CatalogEntry<Bottle>[];
  backgrounds: CatalogEntry<Background>[];
  coins: number;
  level: number;
}

export interface RunStartResponse {
  runId: string;
  seed: number;
}

export interface RunSubmitResponse {
  flips: number;
  perfects: number;
  maxStreak: number;
  coinsEarned: number;
  coins: number;
  bestFlips: number;
  newBest: boolean;
  weeklyGames: { current: number; target: number } | null;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  flips: number;
  you: boolean;
}

export interface PrizeBandView {
  label: string;
  reward: string;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  windowKey: string;
  resetsAt: string;
  rows: LeaderboardRow[];
  you: { rank: number | null; flips: number; ranked: boolean };
  prizes: PrizeBandView[];
}

export interface MissionStepView {
  type: MissionStep['type'];
  label: string;
  current: number;
  target: number;
  done: boolean;
}

export interface MissionView {
  id: string;
  title: string;
  kind: Mission['kind'];
  period: Mission['period'];
  periodKey: string;
  endsAt: string | null;
  steps: MissionStepView[];
  reward: string;
  rewardType: Reward['type'];
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
  requiresVerified: boolean;
}

export interface MissionsResponse {
  missions: MissionView[];
}

export interface ClaimResponse {
  mission: MissionView;
  rewardId: string | null;
  coins: number;
  unlockedItemIds: string[];
}

export interface TokenInfoResponse {
  code: string;
  valid: boolean;
  reason: 'redeemed' | 'expired' | 'not_found' | null;
  validUntil: string | null;
  campaign: { brand: string; name: string; dailyCapMb: number } | null;
  remaining: number;
  total: number;
}

export interface TokenRedeemResult {
  code: string;
  ok: boolean;
  reason: 'redeemed' | 'expired' | 'not_found' | 'already_yours' | null;
}

export interface RewardView {
  id: string;
  status: 'pending' | 'processing' | 'credited' | 'failed';
  description: string;
  reward: Reward;
  maskedPhone: string | null;
  provider: string;
  createdAt: string;
  creditedAt: string | null;
}
