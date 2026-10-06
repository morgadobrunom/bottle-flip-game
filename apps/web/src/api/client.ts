import type { ApiErrorBody, SessionResponse } from '@bottle-flip/shared';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionResponse | null> | null = null;
const sessionListeners = new Set<(s: SessionResponse) => void>();

export function onSession(fn: (s: SessionResponse) => void) {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}

export function setSession(s: SessionResponse) {
  accessToken = s.accessToken;
  for (const fn of sessionListeners) fn(s);
}

async function raw<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'include',
  });
  if (res.ok) return (await res.json()) as T;
  let err: ApiErrorBody = { error: 'http_error', message: `Request failed (${res.status})` };
  try {
    err = (await res.json()) as ApiErrorBody;
  } catch {
    // non-JSON error body
  }
  throw new ApiError(res.status, err.error, err.message);
}

async function refresh(): Promise<SessionResponse | null> {
  refreshing ??= raw<SessionResponse>('/auth/refresh', { method: 'POST', auth: false })
    .then((s) => {
      setSession(s);
      return s;
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

let booting: Promise<SessionResponse> | null = null;

/** Resumes the refresh-cookie session, or starts a new anonymous one. */
export function bootstrapSession(): Promise<SessionResponse> {
  booting ??= (async () => {
    const resumed = await refresh();
    if (resumed) return resumed;
    const fresh = await raw<SessionResponse>('/sessions/device', { method: 'POST', auth: false });
    setSession(fresh);
    return fresh;
  })().finally(() => {
    booting = null;
  });
  return booting;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await raw<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code !== 'session_expired') {
      const s = (await refresh()) ?? (await bootstrapSession());
      if (s) return raw<T>(path, init);
    }
    throw e;
  }
}

export async function logout() {
  await raw('/auth/logout', { method: 'POST' }).catch(() => undefined);
  accessToken = null;
  return bootstrapSession();
}
