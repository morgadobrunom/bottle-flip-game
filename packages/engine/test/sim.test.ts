import { describe, expect, it } from 'vitest';
import { Sim, dsin, mulberry32, replay, type RunInput } from '../src';
import { playBot } from './bot';

describe('dsin', () => {
  it('tracks Math.sin closely across gameplay ranges', () => {
    for (let x = -500; x <= 500; x += 0.137) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-6);
    }
  });
});

describe('mulberry32', () => {
  it('is reproducible per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
});

describe('Sim', () => {
  it('lays out the same crates for the same seed', () => {
    const a = new Sim(7);
    const b = new Sim(7);
    expect(a.platforms).toEqual(b.platforms);
    expect(new Sim(8).platforms).not.toEqual(a.platforms);
  });

  it('ignores presses while not idle', () => {
    const sim = new Sim(1);
    expect(sim.release()).toBe(false);
    expect(sim.press()).toBe(true);
    expect(sim.press()).toBe(false);
    sim.step();
    expect(sim.release()).toBe(true);
    expect(sim.press()).toBe(false);
    expect(sim.inputs).toEqual([
      { tick: 0, type: 'down' },
      { tick: 1, type: 'up' },
    ]);
  });

  it('ends a run on the first miss', () => {
    const sim = playBot(3, { maxThrows: 0 });
    expect(sim.state).toBe('dead');
    expect(sim.flips).toBe(0);
    expect(sim.failReason).not.toBeNull();
  });

  it('scores landings as flips', () => {
    const sim = playBot(11, { jitter: 0, maxThrows: 8 });
    expect(sim.flips).toBeGreaterThan(0);
    expect(sim.perfects).toBeLessThanOrEqual(sim.flips);
  });
});

describe('replay', () => {
  it('reproduces the live result for many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = playBot(seed * 7919);
      const out = replay(sim.seed, sim.inputs);
      expect(out).toEqual({ ok: true, result: sim.result() });
    }
  });

  it('rejects a run that never ended', () => {
    const sim = playBot(5);
    expect(replay(sim.seed, sim.inputs.slice(0, -2))).toMatchObject({ ok: false, error: 'not_finished' });
  });

  it('rejects inputs after the miss', () => {
    const sim = playBot(5);
    const end = sim.result().endTick;
    const inputs: RunInput[] = [...sim.inputs, { tick: end + 5, type: 'down' }];
    expect(replay(sim.seed, inputs)).toMatchObject({ ok: false, error: 'input_after_end' });
  });

  it('rejects inputs the game would not have accepted', () => {
    const inputs: RunInput[] = [
      { tick: 0, type: 'down' },
      { tick: 10, type: 'up' },
      { tick: 12, type: 'down' },
    ];
    expect(replay(1, inputs)).toMatchObject({ ok: false, error: 'input_rejected' });
  });

  it('rejects unordered and malformed inputs', () => {
    expect(replay(1, [{ tick: 5, type: 'down' }, { tick: 2, type: 'up' }])).toMatchObject({ error: 'unordered_inputs' });
    expect(replay(1, [{ tick: 1.5, type: 'down' }])).toMatchObject({ error: 'bad_input' });
  });

  it('gives a different result when the seed is swapped', () => {
    const sim = playBot(99, { jitter: 0, maxThrows: 10 });
    const out = replay(100, sim.inputs);
    expect(out.ok && out.result.flips === sim.flips && out.result.endTick === sim.result().endTick).toBe(false);
  });
});
