import { Screen, TopBar } from '../components/ui';

const DOCS = {
  terms: {
    title: 'Terms',
    body: [
      'Bottle Flip is a free game. Rewards are limited, available while the campaign budget lasts, and sent only to verified Kenyan Safaricom numbers.',
      'One account per phone number. Scores are verified by replaying each run; runs that fail verification do not count.',
      'Final legal copy is supplied by the campaign owner before launch.',
    ],
  },
  privacy: {
    title: 'Privacy',
    body: [
      'We store your phone number to deliver rewards and keep the leaderboard fair. Leaderboards only ever show a masked number or your nickname.',
      'Brand marketing messages are sent only if you opted in, and you can withdraw that consent at any time.',
      'Final legal copy is supplied by the campaign owner before launch.',
    ],
  },
} as const;

export function Legal({ doc }: { doc: keyof typeof DOCS }) {
  const d = DOCS[doc];
  return (
    <Screen sheet>
      <TopBar title={d.title} />
      <div className="card">
        {d.body.map((p) => (
          <p key={p} className="sub">
            {p}
          </p>
        ))}
      </div>
    </Screen>
  );
}
