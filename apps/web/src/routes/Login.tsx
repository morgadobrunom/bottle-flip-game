import { normalizeKenyanPhone } from '@bottle-flip/shared';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMe, useRequestOtp } from '../api/hooks';
import { BrandSlot, Screen, TopBar, errorMessage } from '../components/ui';
import { loadPendingToken } from '../state/cache';

export const CONSENT_COPY_VERSION = '2026-10-v1';

export interface VerifyState {
  phone: string;
  maskedPhone: string;
  resendInSeconds: number;
  token: string | null;
  brandMarketing: boolean;
  next: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const request = useRequestOtp();
  const [digits, setDigits] = useState('');
  const [token, setToken] = useState(() => loadPendingToken() ?? '');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const brand = me?.campaign?.brand ?? 'our partner';
  const next = (location.state as { next?: string } | null)?.next ?? '/rewards/missions';

  const phone = normalizeKenyanPhone(`+254${digits.replace(/^0/, '')}`);
  const canSubmit = phone !== null && terms && !request.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!phone || !terms) return;
    request.mutate(phone, {
      onSuccess: (res) => {
        const state: VerifyState = {
          phone,
          maskedPhone: res.maskedPhone,
          resendInSeconds: res.resendInSeconds,
          token: token.trim() ? token.trim().toUpperCase() : null,
          brandMarketing: marketing,
          next,
        };
        navigate('/login/verify', { state });
      },
    });
  };

  return (
    <Screen sheet>
      <TopBar title="Step 1 of 2" />
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '1 1 auto' }} onSubmit={submit}>
        <div>
          <div className="h1">Log in to win rewards</div>
          <p className="sub" style={{ marginTop: 8 }}>
            We'll text you a 6-digit code. Rewards are sent to this Safaricom number.
          </p>
        </div>

        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <div className="input-row">
            <span className="prefix">+254</span>
            <input
              id="phone"
              className="input"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="712 345 678"
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="token">
            Token code <span className="hint">(optional)</span>
          </label>
          <input
            id="token"
            className="input"
            placeholder="BF-XXXX-XX"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={20}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>
            I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>, and I'm 18 or older.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>
            Send me offers from <BrandSlot brand={brand} /> by SMS. Optional — you'll still get rewards without this.
          </span>
        </label>

        {request.isError && <div className="error">{errorMessage(request.error)}</div>}
        <div className="spacer" />
        <button className="btn btn--xl btn--block" disabled={!canSubmit}>
          {request.isPending ? 'Sending…' : 'Send code'}
        </button>
      </form>
    </Screen>
  );
}
