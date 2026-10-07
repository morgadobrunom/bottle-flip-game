/** Home overlay on the idle canvas: play, login/rewards, customize, token. */
import { Link } from 'react-router';
import { useMe } from '../api/hooks';
import { useSession } from '../api/session';
import { GearIcon, GiftIcon, PaletteIcon, QrIcon } from '../components/icons';
import { BrandSlot, CoinPill, Screen } from '../components/ui';

export function Home() {
  const { data } = useMe();
  const { ready, online } = useSession();
  const player = data?.player;
  const campaign = data?.campaign;

  return (
    <Screen>
      <div className="topbar">
        <CoinPill coins={player?.coins ?? 0} to="/customize" />
        <Link className="icon-btn" to="/settings" aria-label="Settings">
          <GearIcon />
        </Link>
      </div>

      <div className="home-title">
        <h1 className="title">
          BOTTLE
          <br />
          <span>FLIP</span>
        </h1>
        {campaign && (
          <div className="presented">
            Presented by <BrandSlot brand={campaign.brand} />
          </div>
        )}
      </div>

      <div className="spacer" />

      {player && player.bestFlips > 0 && <div className="best">Best · {player.bestFlips} flips</div>}
      {ready && !online && <div className="banner">Offline — practice mode, no rewards</div>}

      <div className="home-actions">
        <Link className="btn btn--xl btn--block" to="/play">
          PLAY
        </Link>
        {player?.verified ? (
          <Link className="btn btn--ghost btn--block" to="/rewards/missions">
            <GiftIcon /> Rewards
          </Link>
        ) : (
          <Link className="btn btn--ghost btn--block" to="/login">
            <GiftIcon /> Log in to win rewards
          </Link>
        )}
        <div className="grid2">
          <Link className="btn btn--ghost" to="/customize">
            <PaletteIcon /> Customize
          </Link>
          <Link className="btn btn--ghost" to="/t">
            <QrIcon /> Scan token
          </Link>
        </div>
      </div>
    </Screen>
  );
}
