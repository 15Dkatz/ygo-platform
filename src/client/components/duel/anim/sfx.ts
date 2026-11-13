// Tiny synthesized sound effects (Web Audio API: oscillators + filtered noise, no audio files).
// On by default, quiet, and muted with a toggle remembered in localStorage.

export type Sfx = "draw" | "summon" | "set" | "attack" | "damage" | "gain" | "chain" | "resolve" | "turn" | "shuffle" | "win" | "lose" | "pick";

const KEY = "duel-sfx-muted";
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
const lastAt = new Map<Sfx, number>();

export const isMuted = () => muted;

// master volume (0..1), remembered; every sound goes through one gain node
const VOL_KEY = "duel-sfx-volume";
let volume = (() => { try { const v = Number(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.7; } catch { return 0.7; } })();
let masterGain: GainNode | null = null;
function master(a: AudioContext): GainNode {
  if (!masterGain || masterGain.context !== a) { masterGain = a.createGain(); masterGain.connect(a.destination); }
  masterGain.gain.value = volume * 1.4;   // 0.7 (the default) ~ the original loudness
  return masterGain;
}
export const getVolume = () => volume;
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* private mode */ }
  if (masterGain) masterGain.gain.value = volume * 1.4;
  listeners.forEach((l) => l());
}
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export function onMuteChange(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);   // needs a user gesture first; harmless before
  return ctx;
}

/** One note: oscillator with a quick attack and exponential decay. */
function tone(a: AudioContext, at: number, freq: number, ms: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + ms / 1000);
  const peak = (opts.gain ?? 0.08);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  o.connect(g).connect(master(a));
  o.start(at);
  o.stop(at + ms / 1000 + 0.02);
}

/** A short burst of filtered noise (card swish / impact). */
function noise(a: AudioContext, at: number, ms: number, freq: number, gain = 0.06) {
  const len = Math.max(1, Math.floor(a.sampleRate * ms / 1000));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.9;
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master(a));
  src.start(at);
}

export function play(name: Sfx) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastAt.get(name) ?? 0) < 70) return;   // a batch of draws makes one sound per ~70 ms
  lastAt.set(name, now);
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case "draw": noise(a, t, 90, 2400, 0.05); break;
    case "pick": tone(a, t, 880, 60, { type: "triangle", gain: 0.04 }); break;
    case "shuffle": for (let i = 0; i < 4; i++) noise(a, t + i * 0.05, 50, 2000 + i * 300, 0.035); break;
    case "set": noise(a, t, 70, 900, 0.07); tone(a, t, 180, 90, { gain: 0.05 }); break;
    case "summon": tone(a, t, 330, 160, { type: "triangle", gain: 0.06 }); tone(a, t + 0.08, 495, 200, { type: "triangle", gain: 0.05 }); break;
    case "attack": noise(a, t, 180, 1200, 0.06); tone(a, t, 220, 220, { type: "sawtooth", gain: 0.03, to: 90 }); break;
    case "damage": tone(a, t, 160, 260, { type: "square", gain: 0.035, to: 70 }); noise(a, t, 120, 500, 0.06); break;
    case "gain": tone(a, t, 660, 120, { gain: 0.05 }); tone(a, t + 0.09, 990, 180, { gain: 0.04 }); break;
    case "chain": tone(a, t, 740, 110, { type: "triangle", gain: 0.05 }); tone(a, t + 0.06, 1110, 140, { type: "triangle", gain: 0.035 }); break;
    case "resolve": tone(a, t, 520, 140, { type: "sine", gain: 0.04, to: 780 }); break;
    case "turn": tone(a, t, 392, 150, { gain: 0.05 }); tone(a, t + 0.12, 523, 220, { gain: 0.05 }); break;
    case "win": [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.12, f, 260, { type: "triangle", gain: 0.06 })); break;
    case "lose": [392, 330, 262].forEach((f, i) => tone(a, t + i * 0.16, f, 320, { type: "sine", gain: 0.05 })); break;
  }
}

/** Browsers start audio only after a user gesture: unlock on the first pointer / key press. */
export function unlockAudioOnGesture() {
  if (typeof window === "undefined") return () => undefined;
  const go = () => { audio(); };
  window.addEventListener("pointerdown", go, { once: true });
  window.addEventListener("keydown", go, { once: true });
  return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
}
