/**
 * Golden-file test: replay recorded bot runs and assert identical results.
 * Update fixtures with `pnpm --filter @bottle-flip/engine fixtures:update` if physics change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { replay, type RunInput, type RunResult } from '../src';
import { playBot } from './bot';

interface Fixture {
  seed: number;
  inputs: RunInput[];
  result: RunResult;
}

const FIXTURES = fileURLToPath(new URL('./fixtures/runs.json', import.meta.url));

describe('recorded runs', () => {
  it.runIf(process.env.UPDATE_FIXTURES === '1')('regenerates fixtures', () => {
    const runs: Fixture[] = [];
    for (const seed of [1, 2, 3, 42, 1337, 90210, 424242, 2654435761]) {
      const sim = playBot(seed, { jitter: 18, maxThrows: 40 });
      runs.push({ seed: sim.seed, inputs: sim.inputs, result: sim.result() });
    }
    writeFileSync(FIXTURES, JSON.stringify(runs, null, 1) + '\n');
  });

  it('replays every recorded run to the identical result', () => {
    const runs = JSON.parse(readFileSync(FIXTURES, 'utf8')) as Fixture[];
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(replay(run.seed, run.inputs)).toEqual({ ok: true, result: run.result });
    }
  });
});
