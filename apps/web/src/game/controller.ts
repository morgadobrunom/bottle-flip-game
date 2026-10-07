import { coinsFor } from '@bottle-flip/content';
import { STEP, Sim, type FailReason, type SimEvent } from '@bottle-flip/engine';
import { Renderer, type Theme } from '@bottle-flip/engine/render';
import { sfx, unlockAudio } from './sound';

export type Mode = 'attract' | 'play' | 'ended';

export interface Hud {
  mode: Mode;
  paused: boolean;
  flips: number;
  perfects: number;
  streak: number;
  coins: number;
  throws: number;
  toast: { id: number; text: string } | null;
  failReason: FailReason | null;
}

const MAX_FRAME = 0.1;
const END_DELAY_MS = 700;
/** Clicks on UI must not also start a flip. data-no-flip covers overlays like game-over. */
const INTERACTIVE = 'button, a, input, label, select, textarea, [data-no-flip]';

/** Owns the canvas, the simulation clock and input. React only reads the HUD snapshot. */
export class GameController {
  private readonly renderer: Renderer;
  private sim: Sim;
  private hud: Hud = blankHud('attract');
  private readonly listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private toastId = 0;
  private powerEl: HTMLElement | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  onRunEnd: ((sim: Sim) => void) | null = null;

  /**
   * Creates a new game controller: initializes simulation, renderer, and event handlers.
   * Starts the animation loop and respects prefers-reduced-motion.
   * Call destroy() when unmounting the component.
   *
   * @param canvas - HTMLCanvasElement to render the game into.
   * @param theme - Initial bottle and background colors.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    theme: Theme,
  ) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new Renderer(canvas, theme, { reducedMotion });
    this.sim = new Sim(1);
    this.renderer.snapCamera(this.sim);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Cleans up the controller: cancels animation loop and removes event listeners.
   * Must be called when the component unmounts to prevent memory leaks.
   */
  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.endTimer) clearTimeout(this.endTimer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /**
   * Subscribes a React component to HUD state changes.
   * Listener is called whenever the HUD updates (mode, score, toasts, etc).
   *
   * @param fn - Callback invoked on every state change.
   * @returns Unsubscribe function to remove the listener.
   */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /**
   * Returns a snapshot of the current HUD state.
   * @returns Hud object with mode, flips, perfects, streak, coins, etc.
   */
  getHud = () => this.hud;

  /**
   * Returns the current Sim instance for advanced queries (e.g., platforms, bottle state).
   * @returns The Sim object controlling gameplay.
   */
  get currentSim() {
    return this.sim;
  }

  /**
   * Updates the bottle and background colors (e.g., when customizing or equipping a new skin).
   * @param theme - New bottle and background theme.
   */
  setTheme(theme: Theme) {
    this.renderer.setTheme(theme);
  }

  setPowerElement(el: HTMLElement | null) {
    this.powerEl = el;
  }

  showAttract() {
    this.clearEndTimer();
    this.sim = new Sim(1);
    this.renderer.snapCamera(this.sim);
    this.acc = 0;
    this.setHud(blankHud('attract'));
  }

  startRun(seed: number) {
    this.clearEndTimer();
    this.sim = new Sim(seed);
    this.renderer.snapCamera(this.sim);
    this.acc = 0;
    this.last = performance.now();
    this.setHud(blankHud('play'));
  }

  setPaused(paused: boolean) {
    if (this.hud.mode !== 'play') return;
    if (!paused) {
      this.last = performance.now();
      this.acc = 0;
    }
    this.setHud({ ...this.hud, paused });
  }

  private setHud(next: Hud) {
    this.hud = next;
    for (const fn of this.listeners) fn();
  }

  private clearEndTimer() {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private canInput() {
    return this.hud.mode === 'play' && !this.hud.paused;
  }

  private onResize = () => {
    this.renderer.resize();
  };

  private onVisibility = () => {
    if (document.hidden && this.hud.mode === 'play' && !this.hud.paused) this.setPaused(true);
  };

  private onDown = (e: PointerEvent) => {
    if (!this.canInput() || (e.target as Element | null)?.closest(INTERACTIVE)) return;
    unlockAudio();
    this.sim.press();
  };

  private onUp = () => {
    if (this.canInput()) this.sim.release();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat || !this.canInput()) return;
    if ((e.target as Element | null)?.closest('input, textarea')) return;
    e.preventDefault();
    unlockAudio();
    this.sim.press();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && this.canInput()) this.sim.release();
  };

  private handle(events: SimEvent[]) {
    if (!events.length) return;
    this.renderer.handle(events);
    let hud = this.hud;
    for (const e of events) {
      switch (e.type) {
        case 'chargeBand':
          sfx.tick();
          break;
        case 'launch':
          sfx.launch();
          hud = { ...hud, throws: this.sim.throws };
          break;
        case 'land': {
          if (e.gained && e.land === 'perfect') sfx.perfect();
          else sfx.pop();
          const toast = e.gained && e.land === 'perfect' ? { id: ++this.toastId, text: e.streak > 1 ? `PERFECT ×${e.streak}!` : 'PERFECT!' } : hud.toast;
          hud = {
            ...hud,
            flips: this.sim.flips,
            perfects: this.sim.perfects,
            streak: this.sim.streak,
            coins: coinsFor(this.sim.flips, this.sim.perfects),
            toast,
          };
          break;
        }
        case 'fail': {
          sfx.thud();
          hud = { ...hud, failReason: e.reason };
          const sim = this.sim;
          this.endTimer = setTimeout(() => {
            this.setHud({ ...this.hud, mode: 'ended' });
            this.onRunEnd?.(sim);
          }, END_DELAY_MS);
          break;
        }
      }
    }
    if (hud !== this.hud) this.setHud(hud);
  }

  private frame = (now: number) => {
    const dt = Math.min((now - (this.last || now)) / 1000, MAX_FRAME);
    this.last = now;
    if (!this.hud.paused) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.handle(this.sim.step());
        this.acc -= STEP;
      }
    }
    this.renderer.draw(this.sim, this.acc / STEP, this.hud.paused ? 0 : dt, now / 1000);
    if (this.powerEl) this.powerEl.style.width = `${Math.round((this.sim.state === 'charge' ? this.sim.power : 0) * 100)}%`;
    this.raf = requestAnimationFrame(this.frame);
  };
}

function blankHud(mode: Mode): Hud {
  return { mode, paused: false, flips: 0, perfects: 0, streak: 0, coins: 0, throws: 0, toast: null, failReason: null };
}
