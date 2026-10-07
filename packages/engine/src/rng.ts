/**
 * Gameplay PRNG. Math.random() cannot be replayed, so spawn/difficulty/drift
 * all draw from a mulberry32 stream seeded per run.
 */
export type Rng = () => number;

/** Uniform [0, 1) from a 32-bit seed. Same output on every JS engine. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
