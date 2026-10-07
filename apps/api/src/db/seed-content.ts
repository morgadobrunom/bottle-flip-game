/** Idempotent upsert of campaign, catalog, missions, and optional local token codes. */
import {
  CampaignSchema,
  CatalogSchema,
  MissionSchema,
  seedCampaign,
  seedCatalog,
  seedMissions,
  type Campaign,
  type Catalog,
  type Mission,
} from '@bottle-flip/content';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { campaigns, catalogItems, missions, tokens } from './schema';

export interface SeedInput {
  campaign?: Campaign;
  catalog?: Catalog;
  missions?: Mission[];
  devTokens?: number;
}

/** Upserts a campaign with its catalog and missions. Safe to run repeatedly. */
export async function seedContent(db: Db, input: SeedInput = {}) {
  const campaign = CampaignSchema.parse(input.campaign ?? seedCampaign);
  const catalog = CatalogSchema.parse(input.catalog ?? seedCatalog);
  const missionList = (input.missions ?? seedMissions).map((m) => MissionSchema.parse(m));

  await db
    .insert(campaigns)
    .values({
      id: campaign.id,
      brand: campaign.brand,
      name: campaign.name,
      startsAt: new Date(campaign.startsAt),
      endsAt: new Date(campaign.endsAt),
      timezone: campaign.timezone,
      rewardBudgetKes: campaign.rewardBudgetKes,
      dailyCapMb: campaign.dailyCapMb,
      prizes: campaign.prizes,
    })
    .onConflictDoUpdate({
      target: campaigns.id,
      set: {
        brand: campaign.brand,
        name: campaign.name,
        startsAt: new Date(campaign.startsAt),
        endsAt: new Date(campaign.endsAt),
        timezone: campaign.timezone,
        rewardBudgetKes: campaign.rewardBudgetKes,
        dailyCapMb: campaign.dailyCapMb,
        prizes: campaign.prizes,
      },
    });

  const items = [
    ...catalog.bottles.map((data, sort) => ({ kind: 'bottle' as const, data, sort })),
    ...catalog.backgrounds.map((data, sort) => ({ kind: 'background' as const, data, sort })),
  ].map(({ kind, data, sort }) => ({
    id: data.id,
    kind,
    data,
    sort,
    campaignId: data.unlock.type === 'sponsored' ? campaign.id : null,
  }));
  await db
    .insert(catalogItems)
    .values(items)
    .onConflictDoUpdate({
      target: catalogItems.id,
      set: { kind: sql`excluded.kind`, data: sql`excluded.data`, sort: sql`excluded.sort`, campaignId: sql`excluded.campaign_id` },
    });

  await db
    .insert(missions)
    .values(missionList.map((data, sort) => ({ id: data.id, campaignId: campaign.id, data, sort })))
    .onConflictDoUpdate({
      target: missions.id,
      set: { data: sql`excluded.data`, sort: sql`excluded.sort`, campaignId: sql`excluded.campaign_id` },
    });

  const codes: string[] = [];
  for (let i = 0; i < (input.devTokens ?? 0); i++) codes.push(devTokenCode(i));
  if (codes.length) {
    await db
      .insert(tokens)
      .values(codes.map((code) => ({ code, campaignId: campaign.id, validUntil: new Date(campaign.endsAt) })))
      .onConflictDoNothing();
  }
  return { campaignId: campaign.id, tokens: codes };
}

export function devTokenCode(i: number): string {
  const n = (i * 2654435761 + 12345) >>> 0;
  const s = n.toString(36).toUpperCase().padStart(7, '0').slice(-7);
  return `BF-${s.slice(0, 4)}-${s.slice(4, 6)}`;
}
