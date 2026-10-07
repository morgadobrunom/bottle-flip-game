// Math.sin is not specified bit-for-bit across JS engines (V8 vs JavaScriptCore).
// Gameplay must replay identically on the server, so it only uses +, -, *, /,
// Math.round and Math.floor, which IEEE 754 makes exact everywhere.

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/**
 * Deterministic sine approximation using only IEEE 754 exact operations.
 * Unlike Math.sin(), dsin() produces identical bit-for-bit results across
 * all JavaScript engines, making it safe for gameplay determinism and replay.
 *
 * Uses polynomial approximation with range reduction to [-π/2, π/2].
 * Accuracy is sufficient for platform oscillation and animation.
 *
 * @param x - Input angle in radians. Can be any real number.
 * @returns sin(x) computed with polynomial approximation [-1, 1].
 *
 * @example
 * const s = dsin(Math.PI / 2); // ≈ 1.0 (same on all engines)
 */
export function dsin(x: number): number {
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) r = Math.PI - r;
  else if (r < -HALF_PI) r = -Math.PI - r;
  const r2 = r * r;
  return r * (1 - (r2 / 6) * (1 - (r2 / 20) * (1 - (r2 / 42) * (1 - (r2 / 72) * (1 - (r2 / 110) * (1 - r2 / 156))))));
}
