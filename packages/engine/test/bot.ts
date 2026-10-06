import { CHARGE_PERIOD, G, Sim, TICKS_PER_SECOND, launchVelocity, mulberry32 } from '../src';

function powerFor(distance: number): number {
  let best = 0;
  let bestErr = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000;
    const { vx, vy } = launchVelocity(p);
    const err = Math.abs(vx * ((2 * vy) / G) - distance);
    if (err < bestErr) {
      bestErr = err;
      best = p;
    }
  }
  return best;
}

/** Plays a run the way a decent human would: aims at the next crate with some error. */
export function playBot(seed: number, { jitter = 24, maxThrows = 60 } = {}): Sim {
  const sim = new Sim(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let guard = 0; sim.state !== 'dead' && guard < 2_000_000; guard++) {
    if (sim.state === 'idle') {
      const cur = sim.platforms[sim.curIdx]!;
      const next = sim.platforms[sim.curIdx + 1]!;
      const distance =
        sim.throws >= maxThrows
          ? (cur.cx + cur.w / 2 + next.cx - next.w / 2) / 2 - sim.bottle.x
          : next.cx - sim.bottle.x + (rng() - 0.5) * jitter;
      const ticks = Math.max(1, Math.round(powerFor(distance) * CHARGE_PERIOD * TICKS_PER_SECOND));
      sim.press();
      for (let i = 0; i < ticks; i++) sim.step();
      sim.release();
    }
    sim.step();
  }
  return sim;
}
