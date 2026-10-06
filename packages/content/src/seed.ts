import type { Background, Bottle, Campaign, Catalog, Mission } from './schemas';

export const DEFAULT_BOTTLE_ID = 'classic';
export const DEFAULT_BACKGROUND_ID = 'night-soda';

export const seedBottles: Bottle[] = [
  { id: 'classic', name: 'Classic', unlock: { type: 'default' }, body: '#FF7A3D', cap: '#FFD447', label: '#FFF4E4', stripe: '#FF5D8F' },
  { id: 'glass', name: 'Glass', unlock: { type: 'coins', cost: 150 }, body: 'rgba(127,246,211,0.55)', cap: '#C9CED6', label: '#FFF4E4', stripe: '#7FF6D3' },
  {
    id: 'brand-can',
    name: '[BRAND] can',
    unlock: { type: 'sponsored', missionId: 'weekly-data' },
    body: '#C8102E',
    cap: '#F4F1EA',
    label: '#F4F1EA',
    stripe: '#C8102E',
    labelText: 'BRAND',
  },
  { id: 'gold', name: 'Gold', unlock: { type: 'coins', cost: 500 }, body: '#E8B923', cap: '#FFF1A8', label: '#7A5200', stripe: '#FFF4E4' },
  { id: 'neon', name: 'Neon', unlock: { type: 'coins', cost: 900 }, body: '#FF5D8F', cap: '#7FF6D3', label: '#1B1036', stripe: '#7FF6D3' },
  { id: 'mystery', name: 'Mystery', unlock: { type: 'level', level: 10 }, body: '#311B5E', cap: '#FFD447', label: '#7FF6D3', stripe: '#FF5D8F' },
];

export const seedBackgrounds: Background[] = [
  {
    id: 'night-soda',
    name: 'Night soda',
    unlock: { type: 'default' },
    sky: ['#150C2E', '#2A1752', '#3A1F63'],
    platform: ['#5A2FA3', '#2E1B5B'],
    platformTop: '#7FF6D3',
    perfect: '#FFD447',
    accent: '#FFD447',
  },
  {
    id: 'street-stall',
    name: 'Street stall',
    unlock: { type: 'coins', cost: 150 },
    sky: ['#2B1608', '#6B3410', '#C0611C'],
    platform: ['#7A4A21', '#3B230F'],
    platformTop: '#FFD447',
    perfect: '#FF5D8F',
    accent: '#FFAE2E',
  },
  {
    id: 'brand-bar',
    name: '[BRAND] bar',
    unlock: { type: 'sponsored', missionId: 'weekly-data' },
    sky: ['#1A0306', '#4A0A12', '#7A1020'],
    platform: ['#2A2A2A', '#111111'],
    platformTop: '#F4F1EA',
    perfect: '#C8102E',
    accent: '#F4F1EA',
  },
  {
    id: 'beach',
    name: 'Beach',
    unlock: { type: 'coins', cost: 400 },
    sky: ['#0B4F8A', '#3BA3D9', '#FFD9A0'],
    platform: ['#D9A05B', '#8C5A2B'],
    platformTop: '#FFF4E4',
    perfect: '#FF5D8F',
    accent: '#FFF1A8',
  },
  {
    id: 'stadium',
    name: 'Stadium',
    unlock: { type: 'coins', cost: 800 },
    sky: ['#06140D', '#0F3B24', '#1E6B3F'],
    platform: ['#3A3F47', '#1C1F24'],
    platformTop: '#FFFFFF',
    perfect: '#FFD447',
    accent: '#E8F7FF',
  },
  {
    id: 'rooftop',
    name: 'Rooftop',
    unlock: { type: 'level', level: 15 },
    sky: ['#0A0F24', '#24305E', '#E26D5C'],
    platform: ['#3B3355', '#1D1830'],
    platformTop: '#FF7A3D',
    perfect: '#7FF6D3',
    accent: '#FFE7C2',
  },
];

export const seedCatalog: Catalog = { bottles: seedBottles, backgrounds: seedBackgrounds };

export const seedMissions: Mission[] = [
  {
    id: 'weekly-data',
    title: 'Weekly data drop',
    kind: 'drop',
    period: 'weekly',
    steps: [{ type: 'play_games', count: 5 }, { type: 'redeem_token' }, { type: 'verify_phone' }],
    reward: { type: 'data', amountMb: 100, costKes: 20 },
    requiresVerified: true,
  },
  {
    id: 'daily-20-flips',
    title: 'Land 20 flips in one run',
    kind: 'daily',
    period: 'daily',
    steps: [{ type: 'flips_in_run', count: 20 }],
    reward: { type: 'coins', amount: 100 },
    requiresVerified: false,
  },
  {
    id: 'perfect-5',
    title: '5 PERFECT landings in a row',
    kind: 'achievement',
    period: 'once',
    steps: [{ type: 'perfect_streak', count: 5 }],
    reward: { type: 'item', itemId: 'neon' },
    requiresVerified: false,
  },
  {
    id: 'streak-3-days',
    title: 'Play 3 days in a row',
    kind: 'streak',
    period: 'once',
    steps: [{ type: 'play_days_in_row', count: 3 }],
    reward: { type: 'coins', amount: 200 },
    requiresVerified: false,
  },
];

export const seedCampaign: Campaign = {
  id: 'launch',
  brand: '[BRAND]',
  name: 'Flip to win data',
  startsAt: '2026-10-01T00:00:00+03:00',
  endsAt: '2026-12-31T23:59:59+03:00',
  timezone: 'Africa/Nairobi',
  rewardBudgetKes: 250_000,
  dailyCapMb: 100,
  prizes: {
    daily: [{ fromRank: 1, toRank: 10, reward: { type: 'data', amountMb: 50, costKes: 10 } }],
    weekly: [
      { fromRank: 1, toRank: 1, reward: { type: 'data', amountMb: 2048, costKes: 200 } },
      { fromRank: 2, toRank: 10, reward: { type: 'data', amountMb: 250, costKes: 50 } },
      { fromRank: 11, toRank: 100, reward: { type: 'airtime', amountKes: 20, costKes: 20 } },
    ],
    monthly: [{ fromRank: 1, toRank: 3, reward: { type: 'data', amountMb: 5120, costKes: 500 } }],
  },
};
