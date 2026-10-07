/**
 * Gameplay PRNG. Math.random() cannot be replayed, so spawn/difficulty/drift
 * all draw from a mulberry32 stream seeded per run.
 */
export type Rng = () => number;

/**
 * Creates a deterministic PRNG from a 32-bit seed.
 * Implements mulberry32, which produces uniform [0, 1) values with identical
 * output across all JavaScript engines (V8, JavaScriptCore, etc).
 *
 * @param seed - A 32-bit integer seed value. Will be zero-extended to unsigned 32-bit.
 * @returns A function that returns the next pseudorandom number in [0, 1).
 *
 * @example
 * const rng = mulberry32(12345);
 * const value = rng(); // Same for seed 12345 on any JS engine
 */
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

/**
 * Generates a random 32-bit seed using Math.random().
 * Used to create unique seeds for new gameplay sessions.
 *
 * @returns A random unsigned 32-bit integer suitable for mulberry32().
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
