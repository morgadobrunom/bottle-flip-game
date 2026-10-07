/**
 * Persistent canvas + GameController. Routes call useGame()/useHud().
 * VITE_E2E (or Vite DEV) exposes window.__bf for scripted play tests.
 */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCatalog, useMe } from '../api/hooks';
import { saveTheme } from '../state/cache';
import { GameController, type Hud } from './controller';
import { setSoundEnabled } from './sound';
import { defaultTheme, resolveTheme } from './theme';

const GameContext = createContext<GameController | null>(null);

/** One full-screen canvas for the whole app; screens render on top of it. */
export function GameStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [controller, setController] = useState<GameController | null>(null);
  const me = useMe();
  const catalog = useCatalog();

  useEffect(() => {
    const c = new GameController(canvasRef.current!, defaultTheme);
    setController(c);
    if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') (window as unknown as { __bf?: GameController }).__bf = c;
    return () => c.destroy();
  }, []);

  const player = me.data?.player;
  useEffect(() => {
    if (!controller) return;
    const theme = resolveTheme(player, catalog.data);
    controller.setTheme(theme);
    if (catalog.data) saveTheme(theme);
  }, [controller, player, catalog.data]);

  useEffect(() => {
    setSoundEnabled(player?.sound ?? true);
  }, [player?.sound]);

  return (
    <GameContext.Provider value={controller}>
      <canvas ref={canvasRef} className="stage" aria-hidden="true" />
      {controller && children}
    </GameContext.Provider>
  );
}

export function useGame(): GameController {
  const c = useContext(GameContext);
  if (!c) throw new Error('useGame must be used inside GameStage');
  return c;
}

export function useHud(): Hud {
  const c = useGame();
  return useSyncExternalStore(c.subscribe, c.getHud);
}
