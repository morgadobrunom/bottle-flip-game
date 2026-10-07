/** Tiny oscillator SFX. Unlock from a tap/key so iOS will actually play. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Must be called from a user gesture before sounds can play on mobile. */
export function unlockAudio() {
  if (ctx) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
  if (!enabled || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

function fizz() {
  if (!enabled || !ctx) return;
  const len = ctx.sampleRate * 0.3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = 0.25;
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  pop: () => tone(340, 170, 0.1, 'sine', 0.3),
  thud: () => tone(130, 55, 0.18, 'triangle', 0.35),
  tick: () => tone(520, 480, 0.03, 'square', 0.04),
  launch: () => tone(200, 420, 0.12, 'sine', 0.15),
  perfect: () => {
    fizz();
    tone(340, 170, 0.1, 'sine', 0.3);
  },
};
