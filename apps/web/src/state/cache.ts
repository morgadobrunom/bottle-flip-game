/** localStorage `/me` + equipped theme; sessionStorage holds a pending bottle token. */
import type { Background, Bottle } from '@bottle-flip/content';
import type { MeResponse } from '@bottle-flip/shared';

const ME_KEY = 'bf:me';
const THEME_KEY = 'bf:theme';
const PENDING_TOKEN_KEY = 'bf:pending-token';

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or disabled
  }
}

export const loadMe = () => read<MeResponse>(localStorage, ME_KEY);
export const saveMe = (me: MeResponse) => write(localStorage, ME_KEY, me);

export const loadTheme = () => read<{ bottle: Bottle; background: Background }>(localStorage, THEME_KEY);
export const saveTheme = (t: { bottle: Bottle; background: Background }) => write(localStorage, THEME_KEY, t);

export const loadPendingToken = () => read<string>(sessionStorage, PENDING_TOKEN_KEY);
export const savePendingToken = (code: string | null) =>
  code ? write(sessionStorage, PENDING_TOKEN_KEY, code) : sessionStorage.removeItem(PENDING_TOKEN_KEY);
