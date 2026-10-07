/** Bottles/backgrounds grid with a live preview canvas and buy/equip. */
import type { Background, Bottle } from '@bottle-flip/content';
import { Sim } from '@bottle-flip/engine';
import { Renderer, type Theme } from '@bottle-flip/engine/render';
import type { CatalogEntry, ItemStatus } from '@bottle-flip/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useBuyItem, useCatalog, useMe, usePatchMe } from '../api/hooks';
import { CoinPill, MiniBottle, Screen, TopBar, backgroundSwatch, errorMessage, useSnackbar } from '../components/ui';
import { resolveTheme } from '../game/theme';

type Tab = 'bottles' | 'backgrounds';

function statusText(s: ItemStatus): string {
  switch (s.status) {
    case 'equipped':
      return 'EQUIPPED';
    case 'owned':
      return 'OWNED';
    case 'buy':
      return `${s.cost} COINS`;
    case 'level':
      return `LEVEL ${s.level}`;
    case 'sponsored':
      return 'MISSION';
  }
}

function Preview({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = new Renderer(canvas, theme, { reducedMotion, groundRatio: 0.78, anchorX: 0.42 });
    renderer.current = r;
    const sim = new Sim(1);
    r.snapCamera(sim);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      r.draw(sim, 0, Math.min((now - last) / 1000, 0.1), now / 1000);
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.current = null;
    };
    // the renderer is created once; theme changes go through setTheme below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderer.current?.setTheme(theme);
  }, [theme]);

  return <canvas ref={ref} aria-label={`Preview of ${theme.bottle.name} on ${theme.background.name}`} />;
}

export function Customize() {
  const { data: me } = useMe();
  const catalog = useCatalog();
  const patch = usePatchMe();
  const buy = useBuyItem();
  const snack = useSnackbar();
  const [tab, setTab] = useState<Tab>('bottles');
  const [selected, setSelected] = useState<{ bottle?: string; background?: string }>({});

  const equipped = resolveTheme(me?.player, catalog.data);
  const bottles = catalog.data?.bottles ?? [];
  const backgrounds = catalog.data?.backgrounds ?? [];
  const selBottle = bottles.find((e) => e.item.id === selected.bottle);
  const selBackground = backgrounds.find((e) => e.item.id === selected.background);
  const previewTheme: Theme = {
    bottle: selBottle?.item ?? equipped.bottle,
    background: selBackground?.item ?? equipped.background,
  };
  const focus: CatalogEntry<Bottle | Background> | undefined = tab === 'bottles' ? selBottle : selBackground;

  const equip = (entry: CatalogEntry<Bottle | Background>) => {
    const body = tab === 'bottles' ? { equippedBottleId: entry.item.id } : { equippedBackgroundId: entry.item.id };
    patch.mutate(body, {
      onSuccess: () => snack(`${entry.item.name} equipped`),
      onError: (e) => snack(errorMessage(e)),
    });
  };

  const onTap = (entry: CatalogEntry<Bottle | Background>) => {
    setSelected((s) => (tab === 'bottles' ? { ...s, bottle: entry.item.id } : { ...s, background: entry.item.id }));
    if (entry.status === 'owned') equip(entry);
    else if (entry.status === 'level') snack(`Reach level ${entry.level} to unlock`);
    else if (entry.status === 'sponsored') snack('Unlocked by a sponsored mission');
  };

  const onBuy = (entry: CatalogEntry<Bottle | Background>) => {
    buy.mutate(entry.item.id, {
      onSuccess: () => {
        snack(`${entry.item.name} unlocked`);
        equip(entry);
      },
      onError: (e) => snack(errorMessage(e)),
    });
  };

  const entries: CatalogEntry<Bottle | Background>[] = tab === 'bottles' ? bottles : backgrounds;
  const coins = catalog.data?.coins ?? me?.player.coins ?? 0;

  return (
    <Screen sheet>
      <TopBar title="Customize" right={<CoinPill coins={coins} />} />
      <div className="preview">
        <Preview theme={previewTheme} />
        <span className="label">Preview</span>
      </div>

      <div className="tabs" role="tablist">
        {(['bottles', 'backgrounds'] as const).map((t) => (
          <button key={t} className="tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'bottles' ? 'Bottles' : 'Backgrounds'}
          </button>
        ))}
      </div>

      {catalog.isPending && <div className="empty">Loading…</div>}
      {catalog.isError && <div className="empty">Connect to the internet to change your look.</div>}

      <div className="items">
        {entries.map((entry) => {
          const isBottle = tab === 'bottles';
          const focused = focus?.item.id === entry.item.id;
          const locked = entry.status === 'buy' || entry.status === 'level' || entry.status === 'sponsored';
          const bg = isBottle ? equipped.background : (entry.item as Background);
          return (
            <button
              key={entry.item.id}
              className={`item${locked ? ' locked' : ''}`}
              aria-pressed={entry.status === 'equipped' || focused}
              onClick={() => onTap(entry)}
            >
              <span className="swatch" style={{ background: backgroundSwatch(bg) }}>
                <MiniBottle bottle={isBottle ? (entry.item as Bottle) : equipped.bottle} scale={isBottle ? 1.2 : 0.9} />
              </span>
              <span className="name">{entry.item.name}</span>
              <span className={`status ${entry.status}`}>{statusText(entry)}</span>
            </button>
          );
        })}
      </div>

      <div className="spacer" />

      {focus?.status === 'buy' && (
        <button className="btn btn--block" disabled={buy.isPending || coins < focus.cost} onClick={() => onBuy(focus)}>
          <span className="coin" aria-hidden="true" />
          {coins < focus.cost ? `Need ${focus.cost - coins} more coins` : `Unlock for ${focus.cost}`}
        </button>
      )}
      {focus?.status === 'sponsored' && (
        <Link className="btn btn--mint btn--block" to="/rewards/missions">
          See the mission
        </Link>
      )}
    </Screen>
  );
}
