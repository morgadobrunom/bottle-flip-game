import { coinsFor } from '@bottle-flip/content';
import { randomSeed, type FailReason, type Sim } from '@bottle-flip/engine';
import type { MeResponse, RunSubmitResponse } from '@bottle-flip/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keys, runs, useMe } from '../api/hooks';
import { useSession } from '../api/session';
import { PauseIcon } from '../components/icons';
import { CoinPill, Progress, Screen, errorMessage } from '../components/ui';
import { useGame, useHud } from '../game/GameStage';

interface Outcome {
  flips: number;
  coinsEarned: number;
  best: number;
  newBest: boolean;
  weeklyGames: RunSubmitResponse['weeklyGames'];
  practice: boolean;
  error: string | null;
}

type Phase = { name: 'loading' } | { name: 'playing'; runId: string | null } | { name: 'submitting' } | { name: 'over'; outcome: Outcome };

const FAIL_TEXT: Record<FailReason, string> = {
  lip: 'Clipped the edge',
  gap: 'Missed the platform',
  short: 'Fell short',
};

export function Play() {
  const game = useGame();
  const hud = useHud();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { online, ready } = useSession();
  const { data: me } = useMe();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const powerRef = useRef<HTMLSpanElement>(null);

  const finish = useCallback(
    async (runId: string | null, sim: Sim) => {
      const local = sim.result();
      const prevBest = qc.getQueryData<MeResponse>(keys.me)?.player.bestFlips ?? 0;
      const practice: Outcome = {
        flips: local.flips,
        coinsEarned: 0,
        best: Math.max(prevBest, local.flips),
        newBest: false,
        weeklyGames: null,
        practice: true,
        error: null,
      };
      if (!runId) {
        setPhase({ name: 'over', outcome: practice });
        return;
      }
      setPhase({ name: 'submitting' });
      try {
        const res = await runs.submit(runId, { inputs: sim.inputs, claimed: local });
        qc.setQueryData<MeResponse>(keys.me, (old) =>
          old ? { ...old, player: { ...old.player, coins: res.coins, bestFlips: res.bestFlips } } : old,
        );
        void qc.invalidateQueries({ queryKey: keys.me });
        void qc.invalidateQueries({ queryKey: keys.missions });
        void qc.invalidateQueries({ queryKey: ['leaderboard'] });
        void qc.invalidateQueries({ queryKey: keys.catalog });
        setPhase({
          name: 'over',
          outcome: {
            flips: res.flips,
            coinsEarned: res.coinsEarned,
            best: res.bestFlips,
            newBest: res.newBest,
            weeklyGames: res.weeklyGames,
            practice: false,
            error: null,
          },
        });
      } catch (err) {
        setPhase({ name: 'over', outcome: { ...practice, practice: false, error: errorMessage(err) } });
      }
    },
    [qc],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPhase({ name: 'loading' });
    const begin = (runId: string | null, seed: number) => {
      if (cancelled) return;
      game.onRunEnd = (sim) => void finish(runId, sim);
      game.startRun(seed);
      setPhase({ name: 'playing', runId });
    };
    if (online) {
      runs.start().then(
        (r) => begin(r.runId, r.seed),
        () => begin(null, randomSeed()),
      );
    } else {
      begin(null, randomSeed());
    }
    return () => {
      cancelled = true;
    };
  }, [game, finish, online, ready, attempt]);

  useEffect(
    () => () => {
      game.onRunEnd = null;
      game.setPowerElement(null);
      game.showAttract();
    },
    [game],
  );

  useEffect(() => {
    game.setPowerElement(powerRef.current);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') game.setPaused(!game.getHud().paused);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const playing = phase.name === 'playing' && hud.mode === 'play';
  const practice = phase.name === 'playing' && phase.runId === null;

  return (
    <>
      <Screen>
        <div className="topbar">
          <button className="icon-btn" aria-label="Pause" onClick={() => game.setPaused(true)} disabled={!playing}>
            <PauseIcon />
          </button>
          <CoinPill coins={hud.coins} />
        </div>
        <div className="hud-score mono" aria-live="polite">
          {hud.flips}
        </div>
        <div className="label hud-label">flips</div>
        <div className="hud-streak">{hud.streak > 1 ? `STREAK ×${hud.streak}` : ''}</div>
        {practice && <div className="banner">Practice run — not counted</div>}
        {phase.name === 'loading' && <div className="banner">Getting ready…</div>}
        <div className="spacer" />
        {playing && hud.throws === 0 && (
          <div className="hint-card">
            <div className="h2">Hold to charge, release to flip</div>
            <div className="sub">Land it upright. Hit the stripe for a PERFECT and bonus coins.</div>
            <div className="power" aria-hidden="true">
              <span ref={powerRef} style={{ width: 0 }} />
            </div>
          </div>
        )}
      </Screen>

      {hud.toast && (
        <div key={hud.toast.id} className="toast-perfect">
          {hud.toast.text}
        </div>
      )}

      {hud.paused && phase.name === 'playing' && (
        <Screen dim>
          <div className="spacer" />
          <div className="card interactive">
            <div className="h1 center">Paused</div>
            <button className="btn btn--block" onClick={() => game.setPaused(false)}>
              Resume
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => navigate('/')}>
              Leave run
            </button>
            {!practice && <div className="sub center">Leaving ends this run without a score.</div>}
          </div>
          <div className="spacer" />
        </Screen>
      )}

      {(phase.name === 'submitting' || phase.name === 'over') && (
        <GameOver
          outcome={phase.name === 'over' ? phase.outcome : null}
          failReason={hud.failReason}
          verified={me?.player.verified ?? false}
          onAgain={() => setAttempt((n) => n + 1)}
          fallbackCoins={coinsFor(hud.flips, hud.perfects)}
        />
      )}
    </>
  );
}

function GameOver({
  outcome,
  failReason,
  verified,
  onAgain,
  fallbackCoins,
}: {
  outcome: Outcome | null;
  failReason: FailReason | null;
  verified: boolean;
  onAgain: () => void;
  fallbackCoins: number;
}) {
  const weekly = outcome?.weeklyGames;
  return (
    <Screen dim>
      <div className="spacer" />
      <div className="card interactive" data-no-flip>
        <div className="h1 center">Game over</div>
        {failReason && <div className="sub center">{FAIL_TEXT[failReason]}</div>}
        {outcome?.newBest && <div className="newbest">NEW BEST!</div>}
        <div className="stats">
          <div className="stat">
            <span className="label">Flips</span>
            <strong>{outcome?.flips ?? '…'}</strong>
          </div>
          <div className="stat">
            <span className="label">Best</span>
            <strong>{outcome?.best ?? '…'}</strong>
          </div>
          <div className="stat">
            <span className="label">Coins</span>
            <strong>+{outcome ? outcome.coinsEarned : fallbackCoins}</strong>
          </div>
        </div>
        {outcome?.practice && <div className="sub center">Practice runs don't earn coins. Connect to play for real.</div>}
        {outcome?.error && <div className="error center">Score not saved: {outcome.error}</div>}
        <button className="btn btn--xl btn--block" onClick={onAgain} disabled={!outcome}>
          Play again
        </button>
        <Link className="btn btn--ghost btn--block" to="/">
          Home
        </Link>
      </div>

      {weekly && (
        <div className="card card--dashed interactive" style={{ marginTop: 12 }}>
          <div className="row-between">
            <span className="h2">{verified ? 'Weekly data drop' : 'Log in to win rewards'}</span>
            <span className="mono">
              {Math.min(weekly.current, weekly.target)}/{weekly.target}
            </span>
          </div>
          <Progress value={weekly.current} max={weekly.target} thin />
          {verified ? (
            <Link className="link" to="/rewards/missions">
              View missions
            </Link>
          ) : (
            <>
              <div className="sub">Your games already count. Verify your number to claim free data.</div>
              <Link className="btn btn--mint btn--block" to="/login">
                Verify my number
              </Link>
            </>
          )}
        </div>
      )}
      <div className="spacer" />
    </Screen>
  );
}
