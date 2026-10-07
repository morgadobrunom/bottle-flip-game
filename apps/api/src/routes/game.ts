/** Player, catalog, runs, leaderboard, missions. All routes require a Bearer token. */
import {
  LeaderboardQuery,
  PatchMeBody,
  RunSubmitBody,
  type CatalogResponse,
  type ClaimResponse,
  type LeaderboardResponse,
  type MeResponse,
  type MissionsResponse,
  type RunStartResponse,
  type RunSubmitResponse,
} from '@bottle-flip/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { players } from '../db/schema';
import { notFound } from '../errors';
import { assertCanEquip, buyItem, catalogFor } from '../services/catalog';
import { leaderboard } from '../services/leaderboard';
import { claimMission, listMissions } from '../services/missions';
import { getCampaign, getPlayer, toCampaignView, toPlayerView, track } from '../services/players';
import { startRun, submitRun } from '../services/runs';

const IdParam = z.object({ id: z.string().min(1).max(64) });
const UuidParam = z.object({ id: z.uuid() });

export const gameRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db, config } = ctx;

    const campaignOrThrow = async () => {
      const campaign = await getCampaign(db, config.CAMPAIGN_ID);
      if (!campaign) throw notFound('no_campaign');
      return campaign;
    };

    app.get('/me', async (req): Promise<MeResponse> => {
      const auth = ctx.requireAuth(req);
      const player = await getPlayer(db, auth.playerId);
      return { player: toPlayerView(player), campaign: toCampaignView(await getCampaign(db, config.CAMPAIGN_ID)) };
    });

    app.patch('/me', async (req): Promise<MeResponse> => {
      const auth = ctx.requireAuth(req);
      const body = PatchMeBody.parse(req.body);
      const player = await getPlayer(db, auth.playerId);
      if (body.equippedBottleId) await assertCanEquip(db, player, body.equippedBottleId, 'bottle');
      if (body.equippedBackgroundId) await assertCanEquip(db, player, body.equippedBackgroundId, 'background');
      const [updated] = await db
        .update(players)
        .set({ ...body, updatedAt: ctx.now() })
        .where(eq(players.id, player.id))
        .returning();
      return { player: toPlayerView(updated!), campaign: toCampaignView(await getCampaign(db, config.CAMPAIGN_ID)) };
    });

    app.get('/catalog', async (req): Promise<CatalogResponse> => {
      const auth = ctx.requireAuth(req);
      return catalogFor(db, await getPlayer(db, auth.playerId));
    });

    app.post('/items/:id/buy', async (req): Promise<CatalogResponse> => {
      const auth = ctx.requireAuth(req);
      const { id } = IdParam.parse(req.params);
      const { player, cost } = await buyItem(db, auth.playerId, id);
      await track(db, player.id, 'item_bought', { itemId: id, cost });
      return catalogFor(db, player);
    });

    app.post('/runs/start', async (req): Promise<RunStartResponse> => {
      const auth = ctx.requireAuth(req);
      await getPlayer(db, auth.playerId);
      return startRun(db, auth.playerId, config.CAMPAIGN_ID, ctx.now());
    });

    app.post('/runs/:id/submit', async (req): Promise<RunSubmitResponse> => {
      const auth = ctx.requireAuth(req);
      const { id } = UuidParam.parse(req.params);
      const body = RunSubmitBody.parse(req.body);
      return submitRun(db, {
        playerId: auth.playerId,
        runId: id,
        body,
        ttlMinutes: config.RUN_TTL_MINUTES,
        campaignId: config.CAMPAIGN_ID,
        now: ctx.now(),
      });
    });

    app.get('/leaderboard', async (req): Promise<LeaderboardResponse> => {
      const auth = ctx.requireAuth(req);
      const { period } = LeaderboardQuery.parse(req.query);
      return leaderboard(db, await campaignOrThrow(), period, await getPlayer(db, auth.playerId), ctx.now());
    });

    app.get('/missions', async (req): Promise<MissionsResponse> => {
      const auth = ctx.requireAuth(req);
      return { missions: await listMissions(db, await getPlayer(db, auth.playerId), await campaignOrThrow(), ctx.now()) };
    });

    app.post('/missions/:id/claim', async (req): Promise<ClaimResponse> => {
      const auth = ctx.requireAuth(req);
      const { id } = IdParam.parse(req.params);
      const res = await claimMission(db, ctx.queue, auth.playerId, id, await campaignOrThrow(), ctx.now());
      await track(db, auth.playerId, 'mission_claimed', { missionId: id, periodKey: res.mission.periodKey, rewardId: res.rewardId });
      return res;
    });
  };
