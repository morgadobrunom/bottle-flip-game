/** Printed tokens, redemption, and live reward status for the "you won" screen. */
import type { RewardView, TokenInfoResponse, TokenRedeemResult } from '@bottle-flip/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { rewards } from '../db/schema';
import { forbidden, notFound } from '../errors';
import { getPlayer, track } from '../services/players';
import { toRewardView } from '../services/rewards';
import { redeemToken, tokenInfo } from '../services/tokens';

const CodeParam = z.object({ code: z.string().min(4).max(20) });
const UuidParam = z.object({ id: z.uuid() });

export const rewardRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db } = ctx;

    app.get('/tokens/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req): Promise<TokenInfoResponse> => {
      const { code } = CodeParam.parse(req.params);
      return tokenInfo(db, code, ctx.now());
    });

    app.post('/tokens/:code/redeem', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req): Promise<TokenRedeemResult> => {
      const auth = ctx.requireAuth(req);
      const { code } = CodeParam.parse(req.params);
      const player = await getPlayer(db, auth.playerId);
      if (!player.verifiedAt) throw forbidden('verify_required', 'Verify your number to use a token');
      const result = await db.transaction((tx) => redeemToken(tx, player.id, code, ctx.now()));
      if (result.ok) await track(db, player.id, 'token_redeemed', { code: result.code });
      return result;
    });

    app.get('/rewards/:id', async (req): Promise<RewardView> => {
      const auth = ctx.requireAuth(req);
      const { id } = UuidParam.parse(req.params);
      const player = await getPlayer(db, auth.playerId);
      const [row] = await db
        .select()
        .from(rewards)
        .where(and(eq(rewards.id, id), eq(rewards.playerId, player.id)));
      if (!row) throw notFound('unknown_reward');
      return toRewardView(row, player.phone, ctx.credit.name === 'stub' ? 'Safaricom (test)' : 'Safaricom');
    });
  };
