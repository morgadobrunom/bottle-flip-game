/** QR / typed token landing. Unverified players stash the code and go to login. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe, useRedeemToken, useTokenInfo } from '../api/hooks';
import { BrandSlot, Progress, Screen, TopBar, errorMessage, useSnackbar } from '../components/ui';
import { savePendingToken } from '../state/cache';

const REASON_TEXT = {
  redeemed: 'This token has already been used.',
  expired: 'This token has expired.',
  not_found: "We couldn't find that token. Check the code under the cap.",
  already_yours: 'You already added this token.',
} as const;

export function TokenEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) navigate(`/t/${encodeURIComponent(clean)}`);
  };
  return (
    <Screen sheet>
      <TopBar title="Token" />
      <form className="card" onSubmit={submit}>
        <div className="h1">Got a token?</div>
        <div className="sub">Scan the QR on a participating bottle, or type the code printed under the cap.</div>
        <div className="field">
          <label htmlFor="code">Token code</label>
          <input
            id="code"
            className="input"
            placeholder="BF-XXXX-XX"
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={20}
          />
        </div>
        <button className="btn btn--block" disabled={!code.trim()}>
          Check token
        </button>
      </form>
    </Screen>
  );
}

export function TokenLanding() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const info = useTokenInfo(code);
  const { data: me } = useMe();
  const redeem = useRedeemToken();
  const verified = me?.player.verified ?? false;
  const t = info.data;

  const claim = () => {
    if (!verified) {
      savePendingToken(code);
      navigate('/login', { state: { next: '/rewards/missions' } });
      return;
    }
    redeem.mutate(code, {
      onSuccess: (r) => {
        if (r.ok) {
          snack('Token added to your weekly mission');
          navigate('/rewards/missions');
        } else if (r.reason) {
          snack(REASON_TEXT[r.reason]);
        }
      },
      onError: (e) => snack(errorMessage(e)),
    });
  };

  return (
    <Screen sheet>
      <TopBar title="Token" back="/" close />
      {info.isPending && <div className="empty">Checking token…</div>}
      {info.isError && <div className="empty">{errorMessage(info.error)}</div>}
      {t && (
        <>
          <div className="card card--glow">
            {t.campaign && (
              <div className="presented">
                Presented by <BrandSlot brand={t.campaign.brand} />
              </div>
            )}
            <div className="h1">{t.valid ? 'You found a token!' : 'Token unavailable'}</div>
            <div className="sub mono">{t.code}</div>
            {t.valid ? (
              <div className="sub">
                Add it to the weekly mission, play 5 games, and win up to {t.campaign?.dailyCapMb ?? 100}MB of free data.
                {t.validUntil && ` Valid until ${new Date(t.validUntil).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}.`}
              </div>
            ) : (
              <div className="error">{t.reason ? REASON_TEXT[t.reason] : 'Not valid'}</div>
            )}
          </div>

          {t.total > 0 && (
            <div className="card">
              <div className="row-between">
                <span className="label">Tokens left this week</span>
                <span className="mono">
                  {t.remaining.toLocaleString('en-KE')} / {t.total.toLocaleString('en-KE')}
                </span>
              </div>
              <Progress value={t.remaining} max={t.total} />
            </div>
          )}

          <div className="spacer" />
          {t.valid && (
            <button className="btn btn--xl btn--block" onClick={claim} disabled={redeem.isPending}>
              {verified ? 'Add token' : 'Verify & play'}
            </button>
          )}
          <Link className="link" to="/play">
            Just play
          </Link>
        </>
      )}
    </Screen>
  );
}
