import type { Background, Bottle } from '@bottle-flip/content';
import { BOTTLE_H, BOTTLE_W, G, SETTLE_TICKS, launchVelocity, type Platform, type Sim, type SimEvent } from './sim';

export interface Theme {
  bottle: Bottle;
  background: Background;
}

export interface RendererOptions {
  reducedMotion?: boolean;
  /** Ground line as a fraction of canvas height. */
  groundRatio?: number;
  /** Where the bottle sits horizontally, as a fraction of canvas width. */
  anchorX?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  t: number;
  bubble: boolean;
}

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

const CREAM = '#FFF4E4';
const BUBBLE = '#7FF6D3';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private theme: Theme;
  private readonly opts: Required<RendererOptions>;
  private W = 0;
  private H = 0;
  private groundY = 0;
  private camX = 0;
  private shake = 0;
  private particles: Particle[] = [];
  private readonly stars: Star[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    theme: Theme,
    opts: RendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.theme = theme;
    this.opts = { reducedMotion: false, groundRatio: 0.72, anchorX: 0.3, ...opts };
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * 2000, y: Math.random(), r: Math.random() * 1.4 + 0.4, tw: Math.random() * 6 });
    }
    this.resize();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
  }

  resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.W = this.canvas.clientWidth || this.canvas.width;
    this.H = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.groundY = this.H * this.opts.groundRatio;
  }

  snapCamera(sim: Sim) {
    this.camX = sim.bottle.x - this.W * this.opts.anchorX;
    this.particles = [];
    this.shake = 0;
  }

  handle(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === 'land') {
        if (e.land === 'perfect' && e.gained) this.burst(e.x, -BOTTLE_H, 26, true);
        else this.burst(e.x, 0, e.gained ? 12 : 8, false);
      } else if (e.type === 'fail') {
        this.shake = 10;
      }
    }
  }

  draw(sim: Sim | null, alpha: number, frameDt: number, timeSec: number) {
    const bottle = sim ? this.interpolatedBottle(sim, alpha) : null;
    if (bottle) {
      const target = bottle.x - this.W * this.opts.anchorX;
      this.camX += (target - this.camX) * Math.min(1, frameDt * 5);
    }
    let shakeX = 0;
    if (this.shake > 0) {
      shakeX = rand(-this.shake, this.shake);
      this.shake = Math.max(0, this.shake - frameDt * 40);
    }
    const cam = this.camX + shakeX;

    this.drawBackground(timeSec, cam);
    if (sim) for (const p of sim.platforms) this.drawPlatform(p, timeSec, cam);
    this.drawParticles(frameDt, cam);
    if (sim && bottle) {
      this.drawBottle(sim, bottle, cam);
      this.drawChargeUI(sim, cam);
    }
  }

  private interpolatedBottle(sim: Sim, alpha: number) {
    const a = sim.prevBottle;
    const b = sim.bottle;
    if (sim.state !== 'fly' && sim.state !== 'dead') return { x: b.x, y: b.y, rot: b.rot };
    return { x: lerp(a.x, b.x, alpha), y: lerp(a.y, b.y, alpha), rot: lerp(a.rot, b.rot, alpha) };
  }

  private burst(x: number, y: number, n: number, big: boolean) {
    if (this.opts.reducedMotion) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(60, big ? 300 : 170);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(2, big ? 5 : 3.5),
        life: rand(0.5, 0.9),
        t: 0,
        bubble: big || Math.random() < 0.4,
      });
    }
  }

  private drawBackground(t: number, cam: number) {
    const { ctx, W, H, groundY } = this;
    const bg = this.theme.background;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg.sky[0]);
    g.addColorStop(0.55, bg.sky[1]);
    g.addColorStop(1, bg.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.fillStyle = CREAM;
    for (const s of this.stars) {
      const sx = ((((s.x - cam * 0.12) % (W + 200)) + (W + 200)) % (W + 200)) - 100;
      const sy = s.y * groundY * 0.85;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 0.9 + s.tw);
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    const mx = W * 0.78 - ((cam * 0.05) % W);
    const my = H * 0.16;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = bg.accent;
    ctx.beginPath();
    ctx.arc(mx, my, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,21,3,.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(a) * 28, my + Math.sin(a) * 28);
      ctx.lineTo(mx + Math.cos(a) * 34, my + Math.sin(a) * 34);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.55)';
    const offset = cam * 0.3;
    for (let k = Math.floor(offset / 130) - 2; k * 130 - offset < W + 260; k++) {
      const h = 60 + ((((k * 7919 + 31) % 90) + 90) % 90);
      ctx.fillRect(k * 130 - offset, groundY + 40 - h, 90, h + 200);
    }
    ctx.restore();

    const g2 = ctx.createLinearGradient(0, groundY, 0, H);
    g2.addColorStop(0, 'rgba(10,5,24,0)');
    g2.addColorStop(1, 'rgba(8,4,20,0.9)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, groundY, W, H - groundY);
  }

  private drawPlatform(p: Platform, t: number, cam: number) {
    const { ctx, W, H, groundY: top } = this;
    const bg = this.theme.background;
    const x = p.cx - cam;
    const w = p.w;
    if (x + w / 2 < -60 || x - w / 2 > W + 60) return;

    ctx.save();
    ctx.translate(x, 0);
    const grad = ctx.createLinearGradient(0, top, 0, top + 140);
    grad.addColorStop(0, bg.platform[0]);
    grad.addColorStop(1, bg.platform[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, top, w, H - top);
    ctx.strokeStyle = 'rgba(255,244,228,0.08)';
    ctx.lineWidth = 2;
    for (let sx = -w / 2 + 8; sx < w / 2 - 4; sx += 12) {
      ctx.beginPath();
      ctx.moveTo(sx, top + 10);
      ctx.lineTo(sx, top + 120);
      ctx.stroke();
    }
    ctx.fillStyle = bg.platformTop;
    this.roundRect(-w / 2 - 3, top - 9, w + 6, 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    this.roundRect(-w / 2 - 3, top - 2, w + 6, 5, 3);
    ctx.fill();
    const pw = w * 0.34;
    ctx.fillStyle = bg.perfect;
    this.roundRect(-pw / 2, top - 9, pw, 5, 3);
    ctx.fill();
    if (p.move) {
      ctx.fillStyle = 'rgba(255,93,143,0.9)';
      const bob = Math.sin(t * 4) * 2;
      this.tri(-w / 2 - 12, top - 3 + bob, -1);
      this.tri(w / 2 + 12, top - 3 + bob, 1);
    }
    ctx.restore();
  }

  private drawBottle(sim: Sim, pos: { x: number; y: number; rot: number }, cam: number) {
    const { ctx, groundY } = this;
    const skin = this.theme.bottle;
    const x = pos.x - cam;
    const y = groundY + pos.y;
    let rot = pos.rot;
    let squash = 1;
    if (sim.state === 'charge') {
      squash = 1 - sim.power * 0.18;
      rot = -sim.power * 0.14;
    } else if (sim.state === 'settle') {
      const k = sim.settleTicks / SETTLE_TICKS;
      rot = Math.sin(k * Math.PI * 3) * sim.wobbleAmp * (1 - k);
    } else if (sim.state === 'idle') {
      rot = 0;
    }

    ctx.save();
    if (sim.state !== 'dead' || pos.y < 40) {
      const hAbove = clamp(-pos.y / 300, 0, 1);
      ctx.globalAlpha = 0.35 * (1 - hAbove * 0.7);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, groundY + 3, 16 * (1 - hAbove * 0.4), 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale((1 / squash) * 0.94 + 0.06, squash);
    ctx.translate(0, -BOTTLE_H / 2);

    const bw = BOTTLE_W;
    const bh = BOTTLE_H;
    ctx.fillStyle = skin.body;
    this.roundRect(-bw / 2, -bh / 2 + 8, bw, bh - 8, 6);
    ctx.fill();
    this.roundRect(-bw / 4, -bh / 2 - 2, bw / 2, 12, 3);
    ctx.fill();
    ctx.fillStyle = skin.cap;
    this.roundRect(-bw / 4 - 1, -bh / 2 - 7, bw / 2 + 2, 7, 2);
    ctx.fill();
    ctx.fillStyle = skin.label;
    ctx.fillRect(-bw / 2, -2, bw, 12);
    ctx.fillStyle = skin.stripe;
    if (skin.labelText) {
      ctx.font = '800 5px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(skin.labelText, 0, 4, bw - 2);
    } else {
      ctx.fillRect(-bw / 2, 2, bw, 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    this.roundRect(-bw / 2 + 2.5, -bh / 2 + 10, 3, bh - 18, 2);
    ctx.fill();
    ctx.restore();
  }

  private drawChargeUI(sim: Sim, cam: number) {
    if (sim.state !== 'charge') return;
    const { ctx, groundY } = this;
    const x = sim.bottle.x - cam;
    const y = groundY - BOTTLE_H - 26;
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,244,228,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = sim.power < 0.75 ? '#7FF6D3' : '#FF5D8F';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + sim.power * Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (sim.throws < 3) {
      const { vx, vy } = launchVelocity(sim.power);
      ctx.save();
      ctx.fillStyle = 'rgba(255,244,228,0.45)';
      for (let i = 1; i <= 11; i++) {
        const tt = i * 0.075;
        const dx = sim.bottle.x + vx * tt - cam;
        const dy = groundY - BOTTLE_H / 2 - (vy * tt - 0.5 * G * tt * tt);
        if (dy > groundY + 10) break;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawParticles(dt: number, cam: number) {
    const { ctx, groundY } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.t += dt;
      if (p.t > p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 500 * dt * (p.bubble ? -0.3 : 1);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.bubble ? BUBBLE : this.theme.background.perfect;
      ctx.beginPath();
      ctx.arc(p.x - cam, groundY + p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private tri(x: number, y: number, dir: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7 * dir, y - 5);
    ctx.lineTo(x - 7 * dir, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
