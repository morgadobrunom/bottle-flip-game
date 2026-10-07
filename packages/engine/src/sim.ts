/**
 * Deterministic bottle-flip simulation.
 *
 * World space: ground at y = 0, +y down, +x to the right. The bottle stands on
 * platforms (crates). Hold to charge, release to launch; landing past the current
 * crate scores a flip. A miss (lip / gap / short) ends the run — no lives.
 *
 * Every gameplay random draw goes through the seeded mulberry32 RNG. Time advances
 * in fixed STEP seconds so a recorded input log replays identically on the server.
 */
import { dsin } from './dmath';
import { mulberry32, type Rng } from './rng';

/** Simulation tick length in seconds. Rendering interpolates between ticks. */
export const STEP = 1 / 120;
export const TICKS_PER_SECOND = 120;
export const G = 2300;
export const BOTTLE_H = 46;
export const BOTTLE_W = 17;
export const CHARGE_PERIOD = 0.85;
export const SETTLE_TICKS = 54;
export const FALL_LIMIT = 80;

export type SimState = 'idle' | 'charge' | 'fly' | 'settle' | 'dead';
export type LandType = 'perfect' | 'ok' | 'edge';
export type FailReason = 'lip' | 'gap' | 'short';
export type InputType = 'down' | 'up';

export interface RunInput {
  tick: number;
  type: InputType;
}

export interface Platform {
  cx: number;
  baseCx: number;
  w: number;
  move: { amp: number; speed: number; phase: number } | null;
  locked: boolean;
}

export interface BottleBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spinRate: number;
  tipDir: number;
}

export type SimEvent =
  | { type: 'launch'; power: number }
  | { type: 'chargeBand' }
  | { type: 'land'; land: LandType; gained: boolean; streak: number; x: number }
  | { type: 'fail'; reason: FailReason };

export interface RunResult {
  flips: number;
  perfects: number;
  maxStreak: number;
  endTick: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Maps charge power 0..1 to launch speed. Same formula the original HTML used. */
export function launchVelocity(power: number): { vx: number; vy: number } {
  return { vx: 130 + power * 430, vy: 430 + power * 540 };
}

export class Sim {
  readonly seed: number;
  readonly inputs: RunInput[] = [];
  tick = 0;
  state: SimState = 'idle';
  flips = 0;
  perfects = 0;
  streak = 0;
  maxStreak = 0;
  throws = 0;
  platforms: Platform[] = [];
  curIdx = 0;
  bottle: BottleBody = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, spinRate: 0, tipDir: 1 };
  prevBottle: BottleBody = { ...this.bottle };
  power = 0;
  chargeTicks = 0;
  settleTicks = 0;
  wobbleAmp = 0;
  deadTicks = 0;
  failReason: FailReason | null = null;
  endTick: number | null = null;

  private readonly rand: Rng;
  private lastBand = -1;
  private pending: SimEvent[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rand = mulberry32(this.seed);
    this.platforms = [{ cx: 120, baseCx: 120, w: 110, move: null, locked: true }];
    this.spawnPlatform();
    this.spawnPlatform();
    this.placeBottleOn(0);
    this.prevBottle = { ...this.bottle };
  }

  get time(): number {
    return this.tick * STEP;
  }

  press(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'charge';
    this.chargeTicks = 0;
    this.power = 0;
    this.lastBand = -1;
    this.inputs.push({ tick: this.tick, type: 'down' });
    return true;
  }

  release(): boolean {
    if (this.state !== 'charge') return false;
    this.inputs.push({ tick: this.tick, type: 'up' });
    this.launch(this.power);
    return true;
  }

  input(type: InputType): boolean {
    return type === 'down' ? this.press() : this.release();
  }

  result(): RunResult {
    return { flips: this.flips, perfects: this.perfects, maxStreak: this.maxStreak, endTick: this.endTick ?? this.tick };
  }

  step(): SimEvent[] {
    const events = this.pending;
    this.pending = [];
    this.prevBottle = { ...this.bottle };
    const t = this.time;

    for (const p of this.platforms) {
      if (p.move && !p.locked) p.cx = p.baseCx + dsin(t * p.move.speed + p.move.phase) * p.move.amp;
    }

    const b = this.bottle;
    switch (this.state) {
      case 'charge': {
        this.chargeTicks++;
        // Triangle wave 0→1→0 so a long hold is not always full power.
        const cyc = ((this.chargeTicks * STEP) / CHARGE_PERIOD) % 2;
        this.power = cyc < 1 ? cyc : 2 - cyc;
        const band = Math.floor(this.power * 8);
        if (band !== this.lastBand) {
          this.lastBand = band;
          events.push({ type: 'chargeBand' });
        }
        break;
      }
      case 'fly': {
        const prevY = b.y;
        b.vy += G * STEP;
        b.x += b.vx * STEP;
        b.y += b.vy * STEP;
        b.rot += b.spinRate * STEP;
        // Only test landing on the tick the bottle crosses the ground, so replay
        // cannot disagree about "which frame we hit".
        if (b.vy > 0 && prevY < 0 && b.y >= 0) {
          const res = this.tryLand();
          if (res && res.type !== 'tip') {
            b.rot = 0;
            events.push(this.landSuccess(res.type, res.plat));
          } else if (res) {
            b.y = 0;
            b.vy = -160;
            b.vx = b.tipDir * 90;
            b.spinRate = b.tipDir * 7;
            events.push(this.fail('lip'));
          }
        } else if (b.y > FALL_LIMIT) {
          const cur = this.platforms[this.curIdx]!;
          events.push(this.fail(b.vx > 0 && b.x > cur.cx + cur.w ? 'gap' : 'short'));
        }
        break;
      }
      case 'settle':
        this.settleTicks++;
        if (this.settleTicks >= SETTLE_TICKS) this.state = 'idle';
        break;
      case 'dead':
        this.deadTicks++;
        b.vy += G * STEP;
        b.x += b.vx * STEP;
        b.y += b.vy * STEP;
        b.rot += b.spinRate * STEP;
        break;
      case 'idle':
        break;
    }

    this.tick++;
    return events;
  }

  private difficulty(n: number) {
    return {
      w: clamp(94 - n * 2.4, 34, 94),
      gapMin: 74 + Math.min(n * 4, 118),
      gapMax: 138 + Math.min(n * 6, 188),
      moveP: n >= 8 ? Math.min(0.15 + (n - 8) * 0.03, 0.55) : 0,
      moveAmp: 18 + Math.min(n, 42),
      moveSpd: this.range(0.9, 1.1 + Math.min(n * 0.05, 1.4)),
    };
  }

  private range(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  private spawnPlatform() {
    const prev = this.platforms[this.platforms.length - 1]!;
    const d = this.difficulty(this.flips + (this.platforms.length - 1 - this.curIdx));
    const gap = this.range(d.gapMin, d.gapMax);
    const cx = prev.baseCx + prev.w / 2 + (prev.move ? prev.move.amp : 0) + gap + d.w / 2;
    let move: Platform['move'] = null;
    if (this.rand() < d.moveP) {
      move = { amp: d.moveAmp, speed: d.moveSpd, phase: this.range(0, Math.PI * 2) };
    }
    this.platforms.push({ cx, baseCx: cx, w: d.w, move, locked: false });
  }

  private placeBottleOn(i: number) {
    this.curIdx = i;
    const p = this.platforms[i]!;
    p.locked = true;
    Object.assign(this.bottle, { x: p.cx, y: 0, vx: 0, vy: 0, rot: 0 });
  }

  private launch(power: number) {
    const { vx, vy } = launchVelocity(power);
    const b = this.bottle;
    b.vx = vx;
    b.vy = -vy;
    const airtime = (2 * vy) / G;
    const spins = Math.max(1, Math.round(airtime * 1.7));
    b.spinRate = (spins * Math.PI * 2) / airtime;
    b.rot = 0;
    this.throws++;
    this.state = 'fly';
    this.pending.push({ type: 'launch', power });
  }

  private tryLand(): { type: LandType | 'tip'; plat: number } | null {
    const b = this.bottle;
    for (let i = this.curIdx; i < this.platforms.length; i++) {
      const p = this.platforms[i]!;
      const dx = b.x - p.cx;
      if (Math.abs(dx) <= p.w / 2 + 4) {
        const frac = Math.abs(dx) / (p.w / 2);
        if (frac > 1) {
          b.tipDir = Math.sign(dx) || 1;
          return { type: 'tip', plat: i };
        }
        // Perfect stripe is the center 34% of a crate, and only when advancing.
        if (frac > 0.78) return { type: 'edge', plat: i };
        return { type: 'ok', plat: i };
      }
    }
    return null;
  }

  private landSuccess(land: LandType, plat: number): SimEvent {
    const gained = plat > this.curIdx;
    const p = this.platforms[plat]!;
    if (p.move) {
      p.move = null;
      p.baseCx = p.cx;
    }
    this.placeBottleOn(plat);

    if (gained) {
      this.flips++;
      if (land === 'perfect') {
        this.streak++;
        this.perfects++;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
      } else {
        this.streak = 0;
      }
      while (this.platforms.length - 1 - this.curIdx < 2) this.spawnPlatform();
    }
    this.wobbleAmp = land === 'edge' ? 0.5 : 0.22;
    this.settleTicks = 0;
    this.state = 'settle';
    return { type: 'land', land, gained, streak: this.streak, x: this.bottle.x };
  }

  private fail(reason: FailReason): SimEvent {
    this.failReason = reason;
    this.deadTicks = 0;
    this.endTick = this.tick + 1;
    this.state = 'dead';
    return { type: 'fail', reason };
  }
}
