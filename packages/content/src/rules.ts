/** Economy helpers shared by API scoring and the HUD coin counter. */
import type { Reward } from './schemas';

export const FLIPS_PER_LEVEL = 10;

/** Server-authoritative coin payout. Perfect landings are worth two extra coins. */
export function coinsFor(flips: number, perfects: number): number {
  return flips + 2 * perfects;
}

export function levelFor(lifetimeFlips: number): number {
  return 1 + Math.floor(lifetimeFlips / FLIPS_PER_LEVEL);
}

/** KES cost that counts against the campaign budget. Skins and coins cost 0. */
export function rewardCostKes(reward: Reward): number {
  return reward.type === 'data' || reward.type === 'airtime' ? reward.costKes : 0;
}

export function describeReward(reward: Reward): string {
  switch (reward.type) {
    case 'data':
      return reward.amountMb >= 1024 ? `${reward.amountMb / 1024} GB data` : `${reward.amountMb} MB data`;
    case 'airtime':
      return `KES ${reward.amountKes} airtime`;
    case 'coins':
      return `◎ ${reward.amount}`;
    case 'item':
      return 'New skin';
  }
}
