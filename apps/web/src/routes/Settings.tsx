import { NicknameSchema } from '@bottle-flip/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { logout } from '../api/client';
import { useMe, usePatchMe } from '../api/hooks';
import { Screen, TopBar, errorMessage, useSnackbar } from '../components/ui';

export function Settings() {
  const { data: me } = useMe();
  const patch = usePatchMe();
  const qc = useQueryClient();
  const snack = useSnackbar();
  const navigate = useNavigate();
  const player = me?.player;
  const [nickname, setNickname] = useState<string | null>(null);
  const nick = nickname ?? player?.nickname ?? '';
  const parsed = NicknameSchema.safeParse(nick);

  const saveNickname = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.success) return;
    patch.mutate(
      { nickname: parsed.data },
      {
        onSuccess: () => {
          setNickname(null);
          snack('Nickname saved');
        },
        onError: (err) => snack(errorMessage(err)),
      },
    );
  };

  const signOut = async () => {
    await logout();
    qc.clear();
    snack('Logged out');
    navigate('/', { replace: true });
  };

  return (
    <Screen sheet>
      <TopBar title="Settings" />
      <div className="card">
        <div className="row-between">
          <span className="h2" id="sound-label">
            Sound
          </span>
          <button
            className="toggle"
            role="switch"
            aria-labelledby="sound-label"
            aria-checked={player?.sound ?? true}
            disabled={!player}
            onClick={() => player && patch.mutate({ sound: !player.sound })}
          />
        </div>
      </div>

      <form className="card" onSubmit={saveNickname}>
        <div className="field">
          <label htmlFor="nick">Leaderboard nickname</label>
          <input
            id="nick"
            className="input"
            maxLength={20}
            placeholder="Pick a name"
            value={nick}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        {nickname !== null && !parsed.success && <div className="error">{parsed.error.issues[0]?.message}</div>}
        <button className="btn btn--small" disabled={nickname === null || !parsed.success || patch.isPending}>
          Save
        </button>
      </form>

      <div className="card">
        <div className="row-between">
          <span className="label">Level</span>
          <span className="mono">{player?.level ?? 1}</span>
        </div>
        <div className="row-between">
          <span className="label">Lifetime flips</span>
          <span className="mono">{player?.lifetimeFlips ?? 0}</span>
        </div>
        <div className="row-between">
          <span className="label">Phone</span>
          <span className="mono">{player?.maskedPhone ?? 'Not verified'}</span>
        </div>
      </div>

      <div className="spacer" />
      {player?.verified ? (
        <button className="btn btn--ghost btn--block" onClick={() => void signOut()}>
          Log out
        </button>
      ) : (
        <Link className="btn btn--mint btn--block" to="/login" state={{ next: '/settings' }}>
          Verify my number
        </Link>
      )}
      <div className="sub center">
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </div>
    </Screen>
  );
}
