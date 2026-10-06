import type { MeResponse } from '@bottle-flip/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadMe, saveMe } from '../state/cache';
import { bootstrapSession, onSession } from './client';

interface SessionState {
  ready: boolean;
  online: boolean;
}

const SessionContext = createContext<SessionState>({ ready: false, online: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<SessionState>({ ready: false, online: false });

  useEffect(() => {
    const cached = loadMe();
    if (cached) qc.setQueryData<MeResponse>(['me'], cached);
    const off = onSession((s) => {
      const me = { player: s.player, campaign: s.campaign };
      qc.setQueryData(['me'], me);
      saveMe(me);
    });
    bootstrapSession()
      .then(() => setState({ ready: true, online: true }))
      .catch(() => setState({ ready: true, online: false }));
    return () => {
      off();
    };
  }, [qc]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
