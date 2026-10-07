/**
 * Device sessions, OTP, refresh, logout. The refresh cookie is scoped to /auth
 * so the rest of the API never sees it.
 */
import { OtpRequestBody, OtpVerifyBody, type OtpRequestResponse, type OtpVerifyResponse, type SessionResponse } from '@bottle-flip/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppContext } from '../app';
import { REFRESH_COOKIE, REFRESH_TTL_DAYS } from '../auth/tokens';
import { sessions } from '../db/schema';
import { unauthorized } from '../errors';
import { requestOtp, verifyOtp } from '../services/auth';
import {
  createAnonymousPlayer,
  createSession,
  getCampaign,
  getPlayer,
  revokeSession,
  rotateSession,
  toCampaignView,
  toPlayerView,
  track,
  type PlayerRow,
} from '../services/players';

export const authRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db, config } = ctx;

    const setRefreshCookie = (reply: FastifyReply, token: string) => {
      reply.setCookie(REFRESH_COOKIE, token, {
        path: '/auth',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        domain: config.COOKIE_DOMAIN,
        maxAge: REFRESH_TTL_DAYS * 86_400,
      });
    };

    const sessionResponse = async (player: PlayerRow, sessionId: string): Promise<SessionResponse> => ({
      accessToken: await ctx.signer.sign({ playerId: player.id, sessionId, verified: player.verifiedAt !== null }),
      player: toPlayerView(player),
      campaign: toCampaignView(await getCampaign(db, config.CAMPAIGN_ID)),
    });

    app.post('/sessions/device', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
      const { player, device } = await createAnonymousPlayer(db, req.headers['user-agent']);
      const { session, refreshToken } = await createSession(db, player.id, device.id);
      setRefreshCookie(reply, refreshToken);
      await track(db, player.id, 'device_session_created');
      return sessionResponse(player, session.id);
    });

    app.post('/auth/refresh', async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) throw unauthorized('no_session');
      const rotated = await rotateSession(db, token);
      if (!rotated) {
        reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
        throw unauthorized('session_expired');
      }
      setRefreshCookie(reply, rotated.refreshToken);
      return sessionResponse(await getPlayer(db, rotated.session.playerId), rotated.session.id);
    });

    app.post('/auth/logout', async (req, reply) => {
      const auth = req.auth;
      if (auth) await revokeSession(db, auth.sessionId);
      reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
      return { ok: true };
    });

    app.post('/auth/otp/request', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req): Promise<OtpRequestResponse> => {
      ctx.requireAuth(req);
      const body = OtpRequestBody.parse(req.body);
      return requestOtp(db, ctx.sms, config.OTP_PEPPER, body.phone, req.ip, ctx.now());
    });

    app.post('/auth/otp/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply): Promise<OtpVerifyResponse> => {
      const auth = ctx.requireAuth(req);
      const body = OtpVerifyBody.parse(req.body);
      const result = await verifyOtp(db, config.OTP_PEPPER, auth.playerId, body, req.ip, ctx.now());

      const [current] = await db.select().from(sessions).where(eq(sessions.id, auth.sessionId));
      if (!current) throw unauthorized('no_session');
      await revokeSession(db, current.id);
      const { session, refreshToken } = await createSession(db, result.player.id, current.deviceId);
      setRefreshCookie(reply, refreshToken);
      return { ...(await sessionResponse(result.player, session.id)), merged: result.merged, token: result.token };
    });
  };
