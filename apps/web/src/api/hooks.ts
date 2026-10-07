/** TanStack Query wrappers around the API. Mutations invalidate related caches. */
import type { LeaderboardPeriod } from '@bottle-flip/content';
import type {
  CatalogResponse,
  ClaimResponse,
  LeaderboardResponse,
  MeResponse,
  MissionsResponse,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  PatchMeBody,
  RewardView,
  RunStartResponse,
  RunSubmitBody,
  RunSubmitResponse,
  TokenInfoResponse,
  TokenRedeemResult,
} from '@bottle-flip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveMe } from '../state/cache';
import { api, setSession } from './client';
import { useSession } from './session';

export const keys = {
  me: ['me'] as const,
  catalog: ['catalog'] as const,
  missions: ['missions'] as const,
  leaderboard: (p: LeaderboardPeriod) => ['leaderboard', p] as const,
  reward: (id: string) => ['reward', id] as const,
  token: (code: string) => ['token', code] as const,
};

export function useMe() {
  const { online } = useSession();
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const me = await api<MeResponse>('/me');
      saveMe(me);
      return me;
    },
    enabled: online,
  });
}

export function usePatchMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchMeBody) => api<MeResponse>('/me', { method: 'PATCH', body }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      saveMe(me);
      void qc.invalidateQueries({ queryKey: keys.catalog });
    },
  });
}

export function useCatalog() {
  const { online } = useSession();
  return useQuery({ queryKey: keys.catalog, queryFn: () => api<CatalogResponse>('/catalog'), enabled: online });
}

export function useBuyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CatalogResponse>(`/items/${encodeURIComponent(id)}/buy`, { method: 'POST' }),
    onSuccess: (cat) => {
      qc.setQueryData(keys.catalog, cat);
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useLeaderboard(period: LeaderboardPeriod) {
  const { online } = useSession();
  return useQuery({
    queryKey: keys.leaderboard(period),
    queryFn: () => api<LeaderboardResponse>(`/leaderboard?period=${period}`),
    enabled: online,
    refetchInterval: 60_000,
  });
}

export function useMissions() {
  const { online } = useSession();
  return useQuery({ queryKey: keys.missions, queryFn: () => api<MissionsResponse>('/missions'), enabled: online });
}

export function useClaimMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<ClaimResponse>(`/missions/${encodeURIComponent(id)}/claim`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.missions });
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: keys.catalog });
    },
  });
}

export function useReward(id: string) {
  return useQuery({
    queryKey: keys.reward(id),
    queryFn: () => api<RewardView>(`/rewards/${id}`),
    refetchInterval: (q) => (q.state.data && ['credited', 'failed'].includes(q.state.data.status) ? false : 2000),
  });
}

export function useTokenInfo(code: string) {
  return useQuery({ queryKey: keys.token(code), queryFn: () => api<TokenInfoResponse>(`/tokens/${encodeURIComponent(code)}`), retry: false });
}

export function useRedeemToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<TokenRedeemResult>(`/tokens/${encodeURIComponent(code)}/redeem`, { method: 'POST' }),
    onSuccess: (_r, code) => {
      void qc.invalidateQueries({ queryKey: keys.token(code) });
      void qc.invalidateQueries({ queryKey: keys.missions });
    },
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) => api<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: { phone } }),
  });
}

export function useVerifyOtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OtpVerifyBody) => api<OtpVerifyResponse>('/auth/otp/verify', { method: 'POST', body }),
    onSuccess: (res) => {
      setSession(res);
      qc.setQueryData(keys.me, { player: res.player, campaign: res.campaign });
      saveMe({ player: res.player, campaign: res.campaign });
      void qc.invalidateQueries();
    },
  });
}

export const runs = {
  start: () => api<RunStartResponse>('/runs/start', { method: 'POST' }),
  submit: (runId: string, body: RunSubmitBody) => api<RunSubmitResponse>(`/runs/${runId}/submit`, { method: 'POST', body }),
};
