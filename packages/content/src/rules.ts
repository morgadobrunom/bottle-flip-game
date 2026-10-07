/** Economy helpers shared by API scoring and the HUD coin counter. */
import type { Reward } from './schemas';

export const FLIPS_PER_LEVEL = 10;

/**
 * Computes server-authoritative coin payout from a run.
 * Perfect landings in the center stripe are worth 2 coins each; regular flips are 1 coin each.
 *
 * @param flips - Total number of successful landings.
 * @param perfects - Number of perfect (center stripe) landings.
 * @returns Total coins earned.
 */
export function coinsFor(flips: number, perfects: number): number {
  return flips + 2 * perfects;
}

/**
 * Computes the player's level based on lifetime flips.
 * Level increases by 1 for every 10 flips, starting at level 1.
 *
 * @param lifetimeFlips - Cumulative flips across all runs.
 * @returns Current player level [1, ∞).
 */
export function levelFor(lifetimeFlips: number): number {
  return 1 + Math.floor(lifetimeFlips / FLIPS_PER_LEVEL);
}

/**
 * Computes the KES cost that counts against the campaign reward budget.
 * Data and airtime rewards have a cost; skins and coins are free (cost 0).
 *
 * @param reward - Reward object from mission or leaderboard.
 * @returns Campaign budget cost in KES.
 */
export function rewardCostKes(reward: Reward): number {
  return reward.type === 'data' || reward.type === 'airtime' ? reward.costKes : 0;
}

/**
 * Human-readable description of a reward for display in the UI.
 * Examples: "100 MB data", "KES 50 airtime", "◎ 150", "New skin".
 *
 * @param reward - The reward object to describe.
 * @returns Display string.
 */
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
