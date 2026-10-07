/** Post-claim screen. Polls GET /rewards/:id until credited or failed. */
import type { Reward } from '@bottle-flip/content';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { useReward } from '../api/hooks';
import { Screen, TopBar, errorMessage, useSnackbar } from '../components/ui';

const SPARK_COLORS = ['#FFD447', '#7FF6D3', '#FF5D8F', '#FF7A3D'];

const STATUS_TEXT = {
  pending: 'Queued',
  processing: 'Sending',
  credited: 'Delivered',
  failed: 'Failed',
} as const;

function headline(r: Reward): string {
  switch (r.type) {
    case 'data':
      return r.amountMb >= 1024 ? `${r.amountMb / 1024}GB` : `${r.amountMb}MB`;
    case 'airtime':
      return `KES ${r.amountKes}`;
    case 'coins':
      return `+${r.amount}`;
    case 'item':
      return 'NEW!';
  }
}

export function RewardWon() {
  const { id = '' } = useParams();
  const reward = useReward(id);
  const snack = useSnackbar();
  const r = reward.data;

  const share = async () => {
    const text = r ? `I just won ${r.description} flipping bottles! Can you beat my score?` : 'Come flip bottles with me!';
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: 'Bottle Flip', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        snack('Link copied');
      }
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <Screen sheet>
      <TopBar back="/rewards/missions" close />
      {reward.isPending && <div className="empty">Loading…</div>}
      {reward.isError && <div className="empty">{errorMessage(reward.error)}</div>}
      {r && (
        <>
          <div className="celebrate" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    '--a': `${i * 30}deg`,
                    background: SPARK_COLORS[i % SPARK_COLORS.length],
                    animationDelay: `${(i % 4) * 0.15}s`,
                  } as CSSProperties
                }
              />
            ))}
            <span className="big">{headline(r.reward)}</span>
          </div>
          <div className="h1 center">You won {r.description}!</div>
          <div className="card">
            <div className="row-between">
              <span className="label">Status</span>
              <span className={`status-pill ${r.status}`}>{STATUS_TEXT[r.status]}</span>
            </div>
            {r.maskedPhone && (
              <div className="row-between">
                <span className="label">Sent to</span>
                <span className="mono">{r.maskedPhone}</span>
              </div>
            )}
            <div className="sub">
              {r.status === 'credited'
                ? 'Your reward has been delivered. Check your SMS for confirmation.'
                : r.status === 'failed'
                  ? "We couldn't deliver this reward. Our team has been notified and will retry."
                  : 'This usually takes under a minute. You can keep playing.'}
            </div>
          </div>
          <div className="spacer" />
          <button className="btn btn--ghost btn--block" onClick={() => void share()}>
            Share
          </button>
          <Link className="btn btn--xl btn--block" to="/play">
            Keep flipping
          </Link>
        </>
      )}
    </Screen>
  );
}
