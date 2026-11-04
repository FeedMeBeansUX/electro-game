import { getSettings } from '../settings';

/**
 * Little synthesized sound effects (no audio files needed).
 * Browsers only allow sound after a tap, so call unlockAudio() from the first tap.
 */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!getSettings().sfx) return null;
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ac();
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
  delay?: number;
}

function tone(freq: number, dur: number, { type = 'square', vol = 0.06, slideTo, delay = 0 }: ToneOpts = {}): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number): void {
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

export const sfx = {
  pickup: () => tone(660, 0.06, { vol: 0.04 }),
  drop: () => tone(392, 0.07, { vol: 0.05 }),
  rotate: () => tone(523, 0.06, { type: 'triangle', vol: 0.08 }),
  connect: () => {
    tone(880, 0.05, { vol: 0.04 });
    tone(1319, 0.09, { vol: 0.04, delay: 0.05 });
  },
  remove: () => tone(440, 0.12, { vol: 0.05, slideTo: 196 }),
  denied: () => tone(165, 0.12, { vol: 0.05 }),
  hint: () => tone(988, 0.1, { type: 'sine', vol: 0.08 }),
  pop: () => {
    noise(0.3, 0.35, 2500);
    tone(220, 0.18, { type: 'triangle', vol: 0.12, slideTo: 55 });
  },
  short: () => tone(98, 0.45, { type: 'sawtooth', vol: 0.05 }),
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, delay: i * 0.11 })),
  tap: () => tone(740, 0.04, { type: 'triangle', vol: 0.06 }),
};
