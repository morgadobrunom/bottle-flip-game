import type { LeaderboardPeriod } from '@bottle-flip/content';
import { formatCountdown, type MissionView } from '@bottle-flip/shared';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useClaimMission, useLeaderboard, useMe, useMissions } from '../api/hooks';
import { CheckIcon } from '../components/icons';
import { BrandSlot, Progress, Screen, TopBar, errorMessage, useSnackbar } from '../components/ui';

const TABS = ['leaderboard', 'missions'] as const;
type Tab = (typeof TABS)[number];

export function Rewards() {
  const { tab } = useParams();
  if (!TABS.includes(tab as Tab)) return <Navigate to="/rewards/leaderboard" replace />;
  return (
    <Screen sheet>
      <TopBar title="Rewards" back="/" />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <Link key={t} className="tab" role="tab" aria-selected={tab === t} to={`/rewards/${t}`} replace>
            {t === 'leaderboard' ? 'Leaderboard' : 'Missions'}
          </Link>
        ))}
      </div>
      {tab === 'leaderboard' ? <Leaderboard /> : <Missions />}
    </Screen>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Leaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const board = useLeaderboard(period);
  const { data: me } = useMe();
  const now = useNow(30_000);
  const d = board.data;
  const verified = me?.player.verified ?? false;

  return (
    <>
      <div className="row-between">
        <div className="chips">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <button key={p} className="chip" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {p[0]!.toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {d && <span className="label">Resets in {formatCountdown(new Date(d.resetsAt).getTime() - now)}</span>}
      </div>

      {d && d.prizes.length > 0 && (
        <div className="prizes">
          {d.prizes.map((p) => (
            <div key={p.label} className="prize">
              <span className="label">{p.label}</span>
              <strong>{p.reward}</strong>
            </div>
          ))}
        </div>
      )}

      {board.isPending && <div className="empty">Loading…</div>}
      {board.isError && <div className="empty">{errorMessage(board.error)}</div>}
      {d && (
        <div className="board">
          {d.rows.length === 0 && <div className="empty">No scores yet. Be the first on the board!</div>}
          {d.rows.map((r) => (
            <div key={`${r.rank}-${r.name}`} className={`board-row${r.you ? ' you' : ''}`}>
              <span className="rank mono">#{r.rank}</span>
              <span className="avatar" aria-hidden="true" />
              <span className="who">{r.you ? `${r.name} (you)` : r.name}</span>
              <span className="score mono">{r.flips}</span>
            </div>
          ))}
        </div>
      )}

      <div className="spacer" />
      {d && (
        <div className="you-bar">
          <span className="rank">{d.you.rank ? `#${d.you.rank}` : '—'}</span>
          <span>{verified ? `Your best: ${d.you.flips} flips` : 'Verify your number to get ranked'}</span>
          {verified ? (
            <Link className="btn btn--small" to="/play">
              Play
            </Link>
          ) : (
            <Link className="btn btn--small btn--mint" to="/login" state={{ next: '/rewards/leaderboard' }}>
              Verify
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function Missions() {
  const missions = useMissions();
  const { data: me } = useMe();
  const claim = useClaimMission();
  const snack = useSnackbar();
  const navigate = useNavigate();
  const verified = me?.player.verified ?? false;
  const list = missions.data?.missions ?? [];
  const drops = list.filter((m) => m.kind === 'drop');
  const daily = list.filter((m) => m.kind === 'daily' || m.kind === 'streak');
  const achievements = list.filter((m) => m.kind === 'achievement');

  const onClaim = (m: MissionView) => {
    claim.mutate(m.id, {
      onSuccess: (res) => {
        if (res.rewardId) {
          navigate(`/rewards/won/${res.rewardId}`);
          return;
        }
        if (res.unlockedItemIds.length) snack(`Unlocked: ${m.reward}`);
        else snack(`+${m.reward}`);
      },
      onError: (e) => snack(errorMessage(e)),
    });
  };

  const props = { verified, onClaim, claiming: claim.isPending ? claim.variables : undefined };

  return (
    <>
      {missions.isPending && <div className="empty">Loading…</div>}
      {missions.isError && <div className="empty">{errorMessage(missions.error)}</div>}
      {drops.map((m) => (
        <DropCard key={m.id} mission={m} brand={me?.campaign?.brand} {...props} />
      ))}
      {daily.length > 0 && <div className="label">Daily</div>}
      {daily.map((m) => (
        <MissionRow key={m.id} mission={m} {...props} />
      ))}
      {achievements.length > 0 && <div className="label">Achievements</div>}
      {achievements.map((m) => (
        <MissionRow key={m.id} mission={m} {...props} />
      ))}
    </>
  );
}

interface MissionProps {
  mission: MissionView;
  verified: boolean;
  claiming: string | undefined;
  onClaim: (m: MissionView) => void;
}

function ClaimButton({ mission, verified, claiming, onClaim }: MissionProps) {
  if (mission.claimed) return <span className="reward-chip reward-chip--muted">Claimed</span>;
  if (mission.requiresVerified && !verified) {
    return (
      <Link className="btn btn--small btn--mint" to="/login" state={{ next: '/rewards/missions' }}>
        Verify to claim
      </Link>
    );
  }
  return (
    <button className="btn btn--small" disabled={!mission.claimable || claiming === mission.id} onClick={() => onClaim(mission)}>
      {claiming === mission.id ? 'Claiming…' : 'Claim'}
    </button>
  );
}

function DropCard(props: MissionProps & { brand: string | undefined }) {
  const { mission, brand } = props;
  const now = useNow(60_000);
  return (
    <div className="card card--glow">
      <div className="row-between">
        {brand ? <BrandSlot brand={brand} /> : <span />}
        {mission.endsAt && <span className="label">Ends in {formatCountdown(new Date(mission.endsAt).getTime() - now)}</span>}
      </div>
      <div className="row-between">
        <div className="h2">{mission.title}</div>
        <span className="reward-chip">{mission.reward}</span>
      </div>
      <div className="steps">
        {mission.steps.map((s) => (
          <div key={s.label} className={`step${s.done ? ' done' : ''}`}>
            <span className="box">{s.done && <CheckIcon />}</span>
            <span>{s.label}</span>
            {s.target > 1 && (
              <span className="mono">
                {Math.min(s.current, s.target)}/{s.target}
              </span>
            )}
          </div>
        ))}
      </div>
      {mission.steps.some((s) => s.type === 'redeem_token' && !s.done) && (
        <Link className="link" to="/t">
          Have a token? Add it here
        </Link>
      )}
      <ClaimButton {...props} />
    </div>
  );
}

function MissionRow(props: MissionProps) {
  const { mission } = props;
  const step = mission.steps[0];
  return (
    <div className="card">
      <div className="row-between">
        <div className="h2" style={{ fontSize: 16 }}>
          {mission.title}
        </div>
        <span className="reward-chip">{mission.reward}</span>
      </div>
      {step && (
        <div className="row-between">
          <div style={{ flex: 1 }}>
            <Progress value={step.current} max={step.target} thin />
          </div>
          <span className="mono">
            {Math.min(step.current, step.target)}/{step.target}
          </span>
          <ClaimButton {...props} />
        </div>
      )}
    </div>
  );
}
