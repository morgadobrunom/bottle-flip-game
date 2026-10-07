/** Step 2: six OTP digits with paste and a 45s resend timer. */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useRequestOtp, useVerifyOtp } from '../api/hooks';
import { Screen, TopBar, errorMessage, useSnackbar } from '../components/ui';
import { savePendingToken } from '../state/cache';
import { CONSENT_COPY_VERSION, type VerifyState } from './Login';

const LEN = 6;

export function Verify() {
  const location = useLocation();
  const state = location.state as VerifyState | null;
  if (!state) return <Navigate to="/login" replace />;
  return <VerifyForm initial={state} />;
}

function VerifyForm({ initial }: { initial: VerifyState }) {
  const navigate = useNavigate();
  const snack = useSnackbar();
  const verify = useVerifyOtp();
  const resend = useRequestOtp();
  const [digits, setDigits] = useState<string[]>(() => Array<string>(LEN).fill(''));
  const [resendAt, setResendAt] = useState(() => Date.now() + initial.resendInSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const submit = (code: string) => {
    verify.mutate(
      {
        phone: initial.phone,
        code,
        token: initial.token ?? undefined,
        consent: { brandMarketing: initial.brandMarketing, copyVersion: CONSENT_COPY_VERSION },
      },
      {
        onSuccess: (res) => {
          savePendingToken(null);
          if (res.token?.ok) snack('Number verified — token added!');
          else if (res.token) snack('Number verified. That token could not be added.');
          else snack('Number verified');
          navigate(initial.next, { replace: true });
        },
        onError: () => {
          setDigits(Array<string>(LEN).fill(''));
          inputs.current[0]?.focus();
        },
      },
    );
  };

  const setAt = (i: number, value: string) => {
    const next = [...digits];
    next[i] = value;
    setDigits(next);
    if (value && i < LEN - 1) inputs.current[i + 1]?.focus();
    if (next.every((d) => d)) submit(next.join(''));
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const code = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    if (!code) return;
    e.preventDefault();
    const next = Array.from({ length: LEN }, (_, i) => code[i] ?? '');
    setDigits(next);
    inputs.current[Math.min(code.length, LEN - 1)]?.focus();
    if (code.length === LEN) submit(code);
  };

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const doResend = () =>
    resend.mutate(initial.phone, {
      onSuccess: (r) => {
        setResendAt(Date.now() + r.resendInSeconds * 1000);
        snack('New code sent');
      },
      onError: (e) => snack(errorMessage(e)),
    });

  return (
    <Screen sheet>
      <TopBar title="Step 2 of 2" back="/login" />
      <div>
        <div className="h1">Enter your code</div>
        <p className="sub" style={{ marginTop: 8 }}>
          Sent to <span className="mono">{initial.maskedPhone}</span>
        </p>
      </div>

      <div className="otp" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            maxLength={1}
            value={d}
            disabled={verify.isPending}
            onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
          />
        ))}
      </div>

      {verify.isPending && <div className="sub center">Checking…</div>}
      {verify.isError && <div className="error center">{errorMessage(verify.error)}</div>}

      <button className="link" disabled={wait > 0 || resend.isPending} onClick={doResend}>
        {wait > 0 ? `Resend code in 0:${String(wait).padStart(2, '0')}` : 'Resend code'}
      </button>
      <button className="link" onClick={() => navigate('/login', { replace: true })}>
        Wrong number?
      </button>
    </Screen>
  );
}
