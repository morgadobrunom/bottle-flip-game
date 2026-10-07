/** Shared chrome: overlay screens, coin pill, snackbars. Pointers here don't flip the bottle. */
import type { Background, Bottle } from '@bottle-flip/content';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { BackIcon, CloseIcon } from './icons';

export function Screen({ sheet, dim, children }: { sheet?: boolean; dim?: boolean; children: ReactNode }) {
  return (
    <div className={`screen${sheet ? ' screen--sheet' : ''}${dim ? ' screen--dim' : ''}`}>
      <div className="col">{children}</div>
    </div>
  );
}

export function TopBar({ title, back = '/', close, right }: { title?: ReactNode; back?: string | null; close?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      {back !== null ? (
        <button
          className="icon-btn"
          aria-label={close ? 'Close' : 'Back'}
          onClick={() => (window.history.length > 1 && !close ? navigate(-1) : navigate(back))}
        >
          {close ? <CloseIcon /> : <BackIcon />}
        </button>
      ) : (
        <span style={{ width: 44 }} />
      )}
      {typeof title === 'string' ? <div className="h2">{title}</div> : (title ?? <span className="spacer" />)}
      {right ?? <span style={{ width: 44 }} />}
    </div>
  );
}

export function CoinPill({ coins, to }: { coins: number; to?: string }) {
  const body = (
    <>
      <span className="coin" aria-hidden="true" />
      <span className="mono">{coins.toLocaleString('en-KE')}</span>
    </>
  );
  return to ? (
    <Link className="pill" to={to} aria-label={`${coins} coins`} style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <span className="pill" aria-label={`${coins} coins`}>
      {body}
    </span>
  );
}

export function Progress({ value, max, thin }: { value: number; max: number; thin?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`progress${thin ? ' progress--thin' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BrandSlot({ brand }: { brand: string }) {
  return <span className="brand-slot">{brand}</span>;
}

export function MiniBottle({ bottle, scale = 1 }: { bottle: Bottle; scale?: number }) {
  return (
    <span className="mini-bottle" style={{ transform: `scale(${scale})` }} aria-hidden="true">
      <i style={{ left: 4, top: 0, width: 10, height: 6, background: bottle.cap, borderRadius: 2 }} />
      <i style={{ left: 5, top: 5, width: 8, height: 10, background: bottle.body, borderRadius: 3 }} />
      <i style={{ left: 0, top: 12, width: 18, height: 34, background: bottle.body, borderRadius: 6 }} />
      <i style={{ left: 0, top: 24, width: 18, height: 10, background: bottle.label }} />
      <i style={{ left: 0, top: 27, width: 18, height: 3, background: bottle.stripe }} />
    </span>
  );
}

export function backgroundSwatch(bg: Background): string {
  return `linear-gradient(180deg, ${bg.sky[0]}, ${bg.sky[1]} 55%, ${bg.sky[2]} 70%, ${bg.platform[0]} 70%, ${bg.platform[1]})`;
}

const SnackContext = createContext<(msg: string) => void>(() => undefined);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ id: Date.now(), text });
    timer.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <SnackContext.Provider value={show}>
      {children}
      {msg && (
        <div key={msg.id} className="snackbar" role="status">
          {msg.text}
        </div>
      )}
    </SnackContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackContext);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return "Can't reach the server. Check your connection.";
  return 'Something went wrong';
}
