import { describe, expect, it } from 'vitest';
import { CampaignSchema, CatalogSchema, MissionSchema, coinsFor, levelFor, seedCampaign, seedCatalog, seedMissions } from '../src';

describe('seed content', () => {
  it('validates against the schemas', () => {
    expect(() => CatalogSchema.parse(seedCatalog)).not.toThrow();
    expect(() => CampaignSchema.parse(seedCampaign)).not.toThrow();
    for (const m of seedMissions) expect(() => MissionSchema.parse(m)).not.toThrow();
  });

  it('has unique ids and exactly one default per kind', () => {
    for (const list of [seedCatalog.bottles, seedCatalog.backgrounds]) {
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
      expect(list.filter((i) => i.unlock.type === 'default')).toHaveLength(1);
    }
  });

  it('points sponsored items at real missions', () => {
    const missionIds = new Set(seedMissions.map((m) => m.id));
    for (const item of [...seedCatalog.bottles, ...seedCatalog.backgrounds]) {
      if (item.unlock.type === 'sponsored') expect(missionIds.has(item.unlock.missionId)).toBe(true);
    }
  });
});

describe('rules', () => {
  it('matches the wireframe coin example', () => {
    expect(coinsFor(12, 3)).toBe(18);
  });

  it('levels every 10 lifetime flips', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(9)).toBe(1);
    expect(levelFor(10)).toBe(2);
    expect(levelFor(90)).toBe(10);
  });
});
