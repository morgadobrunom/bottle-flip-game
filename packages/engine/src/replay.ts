/**
 * Server-side anti-cheat: replay a client's input log against a fresh Sim(seed).
 * The run must end in a miss. Claimed scores are compared to result() by the API.
 */
import { Sim, TICKS_PER_SECOND, type RunInput, type RunResult } from './sim';

export const MAX_RUN_TICKS = 30 * 60 * TICKS_PER_SECOND;
export const MAX_INPUTS = 4000;
const RESOLVE_TICKS = 10 * TICKS_PER_SECOND;

export type ReplayError =
  | 'too_many_inputs'
  | 'bad_input'
  | 'unordered_inputs'
  | 'input_rejected'
  | 'input_after_end'
  | 'not_finished'
  | 'too_long';

export type ReplayOutcome = { ok: true; result: RunResult } | { ok: false; error: ReplayError; tick?: number };

/**
 * Anti-cheat replay: re-runs a recorded game from its seed and inputs.
 * Validates the client's claimed score by simulating the same inputs on the server.
 * The run must end in a miss (dead state); inputs are checked for validity, ordering,
 * and time constraints. Used to verify submitted runs before crediting scores.
 *
 * @param seed - The seeded PRNG value from the run start response.
 * @param inputs - Array of player inputs: tick timestamps and press/release events.
 * @param maxTicks - Maximum simulation ticks allowed (default 30min * 120fps = 216000).
 *
 * @returns An outcome object:
 *   - `{ ok: true, result }` if valid; result contains flips, perfects, maxStreak, endTick.
 *   - `{ ok: false, error, tick? }` if invalid; error describes the rejection reason.
 *
 * @example
 * const outcome = replay(12345, inputs);
 * if (outcome.ok) {
 *   console.log(`Verified: ${outcome.result.flips} flips`);
 * } else {
 *   console.log(`Rejected: ${outcome.error}`);
 * }
 */
export function replay(seed: number, inputs: RunInput[], maxTicks = MAX_RUN_TICKS): ReplayOutcome {
  if (inputs.length > MAX_INPUTS) return { ok: false, error: 'too_many_inputs' };
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i]!;
    if (!Number.isInteger(inp.tick) || inp.tick < 0 || (inp.type !== 'down' && inp.type !== 'up')) {
      return { ok: false, error: 'bad_input', tick: inp.tick };
    }
    if (i > 0 && inp.tick < inputs[i - 1]!.tick) return { ok: false, error: 'unordered_inputs', tick: inp.tick };
  }

  const sim = new Sim(seed);
  let idx = 0;
  let lastInputTick = 0;
  for (;;) {
    while (idx < inputs.length && inputs[idx]!.tick === sim.tick) {
      const inp = inputs[idx]!;
      if (sim.state === 'dead') return { ok: false, error: 'input_after_end', tick: inp.tick };
      if (!sim.input(inp.type)) return { ok: false, error: 'input_rejected', tick: inp.tick };
      lastInputTick = inp.tick;
      idx++;
    }
    if (sim.state === 'dead') {
      if (idx < inputs.length) return { ok: false, error: 'input_after_end', tick: inputs[idx]!.tick };
      return { ok: true, result: sim.result() };
    }
    if (idx >= inputs.length && (sim.state === 'idle' || sim.state === 'charge')) {
      return { ok: false, error: 'not_finished' };
    }
    if (sim.tick >= maxTicks || (idx >= inputs.length && sim.tick > lastInputTick + RESOLVE_TICKS)) {
      return { ok: false, error: 'too_long' };
    }
    sim.step();
  }
}
