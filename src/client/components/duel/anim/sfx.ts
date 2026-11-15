// Synthesized sound effects (Web Audio API: oscillators, filtered noise, a shared reverb; no audio files).
// On by default, quiet, muted with a toggle and a volume slider, both remembered in localStorage.
//
// The basics (draw, set, attack, damage, ...) plus a sound per kind of summon and activation, the card-art
// splash and the chain, so each animation has its own voice (anim/summonFx.ts plays them in step), in one of
// several themes (cinematic, arcane, retro, soft, classic) picked in the duel settings.

export type Sfx = "draw" | "summon" | "set" | "attack" | "damage" | "gain" | "chain" | "resolve" | "turn" | "shuffle" | "win" | "lose" | "pick"
  // summons
  | "sum-normal" | "sum-tribute" | "sum-set" | "sum-flip" | "sum-special" | "sum-ritual" | "sum-fusion" | "sum-synchro" | "sum-xyz" | "sum-link" | "sum-pendulum"
  // activations
  | "act-spell" | "act-quick" | "act-trap" | "act-counter" | "act-monster"
  // moments
  | "splash" | "splash-big" | "boss" | "chain-link"
  // turns and phases (the banner moments)
  | "turn-mine" | "turn-theirs" | "phase-main1" | "phase-battle" | "phase-main2" | "phase-end"
  // a chain link resolving, one per resolve animation style
  | `resolve-${"rings" | "sparkle" | "fireworks" | "aura" | "powerup" | "holy" | "void" | "electric" | "circle" | "frost" | "minimal"}`;

const KEY = "duel-sfx-muted";
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
const lastAt = new Map<string, number>();

export const isMuted = () => muted;

// master volume (0..1), remembered; every sound goes through one gain node (and a soft limiter)
const VOL_KEY = "duel-sfx-volume";
let volume = (() => { try { const v = Number(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.7; } catch { return 0.7; } })();
let masterGain: GainNode | null = null;
function master(a: AudioContext): GainNode {
  if (!masterGain || masterGain.context !== a) {
    masterGain = a.createGain();
    // a gentle compressor so stacked sounds (a summon + its splash + a chain note) don't clip
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    masterGain.connect(comp).connect(a.destination);
  }
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

// ---------------------------------------------------------------------------------------
// building blocks

/** A shared room reverb (a generated decaying-noise impulse): magical sounds send some of their signal here. */
let verb: { ctx: AudioContext; input: GainNode } | null = null;
function reverb(a: AudioContext): GainNode {
  if (verb?.ctx === a) return verb.input;
  const len = Math.floor(a.sampleRate * 2.2);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = a.createConvolver(); conv.buffer = ir;
  const input = a.createGain(); input.gain.value = 0.32;
  input.connect(conv).connect(master(a));
  verb = { ctx: a, input };
  return input;
}

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; wet?: number; detune?: number; pan?: number }
/** One note: oscillator with an attack and exponential decay; `wet` sends it to the reverb. */
function tone(a: AudioContext, at: number, freq: number, ms: number, o: ToneOpts = {}) {
  const osc = a.createOscillator(), g = a.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, at);
  if (o.detune) osc.detune.value = o.detune;
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + ms / 1000);
  const peak = o.gain ?? 0.08;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (o.attack ?? 0.012));
  g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  let out: AudioNode = osc.connect(g);
  if (o.pan) { const p = a.createStereoPanner(); p.pan.value = o.pan; out = out.connect(p); }
  out.connect(master(a));
  if (o.wet) { const w = a.createGain(); w.gain.value = o.wet; out.connect(w).connect(reverb(a)); }
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.05);
}

/** Filtered noise: a swish (bandpass), a thump of air (lowpass) or a hiss (highpass); `sweep` glides the filter. */
function noise(a: AudioContext, at: number, ms: number, freq: number, gain = 0.06, o: { type?: BiquadFilterType; sweep?: number; q?: number; wet?: number; attack?: number } = {}) {
  const len = Math.max(1, Math.floor(a.sampleRate * ms / 1000));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  const atk = Math.max(1, Math.floor(len * (o.attack ?? 0)));
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i < atk ? i / atk : 1 - (i - atk) / (len - atk));
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = o.type ?? "bandpass"; f.Q.value = o.q ?? 0.9;
  f.frequency.setValueAtTime(freq, at);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, at + ms / 1000);
  g.gain.value = gain;
  const out = src.connect(f).connect(g);
  out.connect(master(a));
  if (o.wet) { const w = a.createGain(); w.gain.value = o.wet; out.connect(w).connect(reverb(a)); }
  src.start(at);
}

/** A low body thump (a sine that drops fast): landings, impacts. */
const thump = (a: AudioContext, at: number, gain = 0.22, from = 120, ms = 260) => tone(a, at, from, ms, { gain, to: 38, attack: 0.004 });
/** A bell / glass ping: a few inharmonic partials. */
function bell(a: AudioContext, at: number, f: number, gain = 0.05, ms = 900, wet = 0.5) {
  [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.93, 0.08]].forEach(([k, g]) => tone(a, at, f * k, ms / (k > 2 ? 1.6 : 1), { gain: gain * g, wet, attack: 0.003 }));
}
/** Metallic clang: detuned square partials through a short decay. */
function clang(a: AudioContext, at: number, f: number, gain = 0.04) {
  [1, 1.47, 2.09, 2.76].forEach((k, i) => tone(a, at, f * k, 420 - i * 60, { type: "square", gain: gain / (i + 1), wet: 0.35, attack: 0.002 }));
  noise(a, at, 60, 4000, 0.05, { type: "highpass" });
}
/** A shimmer: high detuned sines rising slightly. */
function shimmer(a: AudioContext, at: number, f = 1760, gain = 0.018, ms = 900) {
  for (let i = 0; i < 4; i++) tone(a, at + i * 0.04, f * (1 + i * 0.25), ms, { gain, to: f * (1 + i * 0.25) * 1.06, detune: (i - 1.5) * 9, wet: 0.7, attack: 0.08, pan: (i - 1.5) * 0.35 });
}
/** Quick notes in a row. */
function arp(a: AudioContext, at: number, freqs: number[], step: number, o: ToneOpts & { ms?: number } = {}) {
  freqs.forEach((f, i) => tone(a, at + i * step, f, o.ms ?? 260, { type: "triangle", gain: 0.045, wet: 0.35, ...o }));
}
const N = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12);   // semitones from C4 (0 = C4 = 261.6 Hz)

// ---------------------------------------------------------------------------------------
// sound themes: how summons, activations, splashes and the chain sound (the basics are shared)

export const SOUND_THEMES = ["cinematic", "arcane", "retro", "soft", "classic"] as const;
export type SoundTheme = (typeof SOUND_THEMES)[number];
export const SOUND_THEME_LABEL: Record<SoundTheme, string> = {
  cinematic: "Cinematic (deep hits, booms, whooshes)", arcane: "Arcane (magic bells and chimes)", retro: "Retro (8-bit chiptune)",
  soft: "Soft (quiet taps and brushes)", classic: "Classic (the original simple beeps)",
};
const THEME_KEY = "duel-sfx-theme";
let soundTheme: SoundTheme = (() => {
  try { const v = localStorage.getItem(THEME_KEY); return (SOUND_THEMES as readonly string[]).includes(v ?? "") ? (v as SoundTheme) : "cinematic"; } catch { return "cinematic"; }
})();
export const getSoundTheme = () => soundTheme;
export function setSoundTheme(t: SoundTheme) {
  soundTheme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

/** A brass-like stab: detuned saws through a lowpass that opens and closes. */
function brass(a: AudioContext, at: number, freqs: number[], ms: number, gain = 0.03, wet = 0.35, bright = 2200) {
  const f = a.createBiquadFilter(), g = a.createGain();
  f.type = "lowpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(bright, at + 0.06); f.frequency.exponentialRampToValueAtTime(500, at + ms / 1000);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  f.connect(g).connect(master(a));
  if (wet) { const w = a.createGain(); w.gain.value = wet; g.connect(w).connect(reverb(a)); }
  for (const fr of freqs) for (const d of [-8, 8]) {
    const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr; o.detune.value = d;
    o.connect(f); o.start(at); o.stop(at + ms / 1000 + 0.05);
  }
}
/** A riser: noise sweeping up into the hit. */
const riser = (a: AudioContext, at: number, ms: number, gain = 0.05) => noise(a, at, ms, 300, gain, { type: "bandpass", sweep: 6000, q: 2, attack: 0.85, wet: 0.3 });
/** A sub drop: the low end of a big hit. */
const sub = (a: AudioContext, at: number, gain = 0.3, ms = 700) => tone(a, at, 70, ms, { gain, to: 28, attack: 0.004 });
/** A whoosh across the stereo field. */
function whoosh(a: AudioContext, at: number, ms: number, gain = 0.06, up = true) {
  noise(a, at, ms, up ? 400 : 3000, gain, { type: "bandpass", sweep: up ? 3500 : 300, q: 1.4, attack: 0.5, wet: 0.25 });
}
/** Chiptune: a square / triangle note with no attack, the 8-bit way. */
const chip = (a: AudioContext, at: number, f: number, ms: number, type: OscillatorType = "square", gain = 0.03, to?: number) =>
  tone(a, at, f, ms, { type, gain, to, attack: 0.002 });
const chipNoise = (a: AudioContext, at: number, ms: number, gain = 0.05, f = 3000) => noise(a, at, ms, f, gain, { type: "highpass" });

type Themed = (a: AudioContext, t: number, name: Sfx, link: number) => void;

/** Cinematic: weight and air. Thumps, sub drops, whooshes, low brass, metal only for the shield. */
const cinematic: Themed = (a, t, name, link) => {
  switch (name) {
    case "sum-normal": thump(a, t, 0.24, 110, 320); noise(a, t, 300, 500, 0.08, { type: "lowpass", sweep: 150 }); noise(a, t, 120, 2500, 0.025, { type: "highpass" }); break;
    case "sum-tribute": thump(a, t, 0.3, 120, 420); sub(a, t + 0.05, 0.25, 800); noise(a, t, 800, 250, 0.1, { type: "lowpass", sweep: 60, wet: 0.3 }); brass(a, t + 0.05, [N(-17), N(-10)], 700, 0.025); break;
    case "sum-set": noise(a, t, 90, 700, 0.06, { type: "lowpass" }); thump(a, t, 0.08, 90, 140); break;
    case "sum-flip": whoosh(a, t, 220, 0.05); thump(a, t + 0.18, 0.14, 120, 220); break;
    case "sum-special": riser(a, t, 420, 0.05); thump(a, t + 0.38, 0.22, 110, 400); brass(a, t + 0.38, [N(-12), N(-5), N(0)], 650, 0.022); break;
    case "sum-ritual": noise(a, t, 1200, 200, 0.05, { type: "lowpass", attack: 0.4, wet: 0.6 }); brass(a, t + 0.2, [N(-15), N(-12), N(-8)], 1300, 0.02, 0.6, 1400); sub(a, t + 0.2, 0.18, 1000); break;
    case "sum-fusion": noise(a, t, 760, 200, 0.08, { sweep: 2400, q: 3, attack: 0.75, wet: 0.35 }); sub(a, t + 0.74, 0.3, 800); brass(a, t + 0.74, [N(-12), N(-9), N(-5)], 800, 0.028); noise(a, t + 0.74, 350, 1800, 0.05, { type: "highpass" }); break;
    case "sum-synchro": [0, 0.11, 0.22].forEach((d, i) => whoosh(a, t + d, 160, 0.035 + i * 0.01)); riser(a, t + 0.15, 280, 0.05); thump(a, t + 0.45, 0.22, 120, 380); brass(a, t + 0.45, [N(-5), N(2), N(7)], 700, 0.024, 0.4, 3000); break;
    case "sum-xyz": noise(a, t, 1000, 120, 0.09, { type: "lowpass", attack: 0.35, wet: 0.45 }); tone(a, t, 45, 1000, { type: "sawtooth", gain: 0.03, to: 60, attack: 0.2, wet: 0.3 }); sub(a, t + 0.9, 0.32, 900); brass(a, t + 0.9, [N(-17), N(-10), N(-5)], 900, 0.026); break;
    case "sum-link": [0, 0.08, 0.16, 0.24].forEach((d, i) => noise(a, t + d, 40, 2500 + i * 400, 0.04, { type: "highpass" })); riser(a, t + 0.2, 300, 0.04); thump(a, t + 0.52, 0.2, 140, 260); noise(a, t + 0.52, 70, 3500, 0.06, { type: "highpass" }); break;
    case "sum-pendulum": whoosh(a, t, 330, 0.05, true); whoosh(a, t + 0.33, 330, 0.05, false); thump(a, t + 0.42, 0.2, 110, 320); break;
    case "act-spell": whoosh(a, t, 260, 0.05); brass(a, t + 0.08, [N(0), N(7)], 450, 0.022, 0.4, 2600); break;
    case "act-quick": noise(a, t, 120, 1200, 0.07, { sweep: 7000 }); thump(a, t + 0.05, 0.12, 140, 160); break;
    case "act-trap": noise(a, t, 45, 3000, 0.1, { type: "highpass" }); thump(a, t, 0.26, 140, 300); brass(a, t + 0.02, [N(-11), N(-10)], 380, 0.026, 0.3, 1600); break;
    case "act-counter": clang(a, t, N(-5), 0.035); thump(a, t, 0.18, 120, 260); break;
    case "act-monster": riser(a, t, 380, 0.045); tone(a, t, N(-24), 600, { type: "sawtooth", gain: 0.03, to: N(-12), attack: 0.1, wet: 0.3 }); thump(a, t + 0.36, 0.16, 110, 260); break;
    case "splash": whoosh(a, t, 450, 0.07); thump(a, t + 0.3, 0.12, 100, 260); break;
    case "splash-big": whoosh(a, t, 480, 0.08); sub(a, t + 0.32, 0.35, 1100); brass(a, t + 0.32, [N(-12), N(-5), N(0), N(4)], 1200, 0.026, 0.55); break;
    case "boss": sub(a, t, 0.36, 1100); noise(a, t, 1000, 120, 0.1, { type: "lowpass", wet: 0.5 }); break;
    case "chain-link": thump(a, t, 0.14, 100 + link * 18, 220); noise(a, t, 60, 2000 + link * 400, 0.05, { type: "highpass" }); tone(a, t, N(-12 + link * 2), 260, { type: "sawtooth", gain: 0.014, wet: 0.3 }); break;
    default: break;
  }
};

/** Retro: 8-bit jingles. */
const retro: Themed = (a, t, name, link) => {
  const run = (notes: number[], step: number, type: OscillatorType = "square", ms = 110) => notes.forEach((n, i) => chip(a, t + i * step, N(n), ms, type));
  switch (name) {
    case "sum-normal": chip(a, t, N(-12), 140, "triangle", 0.06, N(-24)); chipNoise(a, t, 60, 0.04); break;
    case "sum-tribute": chip(a, t, N(-12), 200, "triangle", 0.07, N(-30)); chip(a, t + 0.1, N(-17), 200, "triangle", 0.06, N(-32)); chipNoise(a, t, 140, 0.05, 1500); break;
    case "sum-set": chip(a, t, N(-5), 60, "triangle", 0.04); break;
    case "sum-flip": run([7, 12], 0.06); break;
    case "sum-special": run([0, 4, 7, 12, 16], 0.05); break;
    case "sum-ritual": run([-3, 0, 4, 9], 0.12, "triangle", 260); break;
    case "sum-fusion": run([0, 3, 7, 10, 12, 15], 0.045); chip(a, t + 0.3, N(24), 260, "square", 0.03); break;
    case "sum-synchro": run([12, 16, 19, 24, 28, 31], 0.05); break;
    case "sum-xyz": run([-12, -5, 0, 7], 0.08, "triangle", 160); run([19, 19], 0.18); break;
    case "sum-link": run([24, 19, 24, 28], 0.05); chipNoise(a, t + 0.22, 40, 0.05); break;
    case "sum-pendulum": run([7, 12, 7, 12, 7], 0.07, "triangle", 100); break;
    case "act-spell": run([12, 19, 24], 0.05); break;
    case "act-quick": run([19, 24], 0.035); break;
    case "act-trap": chip(a, t, N(12), 200, "square", 0.04, N(-5)); chipNoise(a, t, 80, 0.05); break;
    case "act-counter": run([24, 24, 31], 0.05); break;
    case "act-monster": chip(a, t, N(-5), 300, "square", 0.035, N(12)); break;
    case "splash": run([12, 16, 19], 0.04, "triangle", 90); break;
    case "splash-big": run([0, 4, 7, 12, 16, 19, 24], 0.05); chip(a, t + 0.4, N(-12), 300, "triangle", 0.06); break;
    case "boss": chip(a, t, N(-12), 400, "triangle", 0.07, N(-36)); chipNoise(a, t, 200, 0.05, 800); break;
    case "chain-link": chip(a, t, N(7 + link * 2), 90, "square", 0.035); chip(a, t + 0.07, N(14 + link * 2), 110, "square", 0.03); break;
    default: break;
  }
};

/** Soft: quiet and close; little taps and brushes, nothing that rings. */
const soft: Themed = (a, t, name, link) => {
  const tap = (f: number, d = 0, g = 0.035) => tone(a, t + d, f, 140, { gain: g, attack: 0.004 });
  const brush = (d = 0, f = 1200, ms = 160, g = 0.035) => noise(a, t + d, ms, f, g, { type: "lowpass" });
  switch (name) {
    case "sum-normal": thump(a, t, 0.1, 100, 200); brush(0, 800); break;
    case "sum-tribute": thump(a, t, 0.14, 100, 260); thump(a, t + 0.1, 0.1, 90, 260); brush(0, 600, 300); break;
    case "sum-set": brush(0, 900, 80, 0.03); break;
    case "sum-flip": brush(0, 2000, 120); tap(N(12), 0.08); break;
    case "sum-special": brush(0, 1500, 300); tap(N(7), 0.15); tap(N(12), 0.24); break;
    case "sum-ritual": brush(0, 600, 500); tap(N(-3), 0.2, 0.03); tap(N(4), 0.32, 0.03); break;
    case "sum-fusion": noise(a, t, 600, 400, 0.04, { sweep: 1500, attack: 0.7 }); tap(N(0), 0.6); tap(N(7), 0.66); break;
    case "sum-synchro": tap(N(12)); tap(N(16), 0.1); tap(N(19), 0.2); break;
    case "sum-xyz": brush(0, 300, 700, 0.04); thump(a, t + 0.85, 0.1, 90, 300); break;
    case "sum-link": tap(N(19), 0, 0.025); tap(N(24), 0.08, 0.025); thump(a, t + 0.3, 0.08, 120, 160); break;
    case "sum-pendulum": tap(N(7)); tap(N(12), 0.3); tap(N(7), 0.6); break;
    case "act-spell": tap(N(12)); tap(N(19), 0.06, 0.025); break;
    case "act-quick": brush(0, 3000, 90); tap(N(19), 0.04); break;
    case "act-trap": thump(a, t, 0.12, 130, 180); brush(0, 2500, 60, 0.04); break;
    case "act-counter": tap(N(16)); tap(N(16), 0.08); break;
    case "act-monster": noise(a, t, 400, 300, 0.035, { sweep: 1200, attack: 0.6 }); tap(N(7), 0.35); break;
    case "splash": brush(0, 1800, 300, 0.03); break;
    case "splash-big": brush(0, 1200, 500, 0.04); thump(a, t + 0.3, 0.12, 90, 400); tap(N(0), 0.3); break;
    case "boss": thump(a, t, 0.16, 80, 500); break;
    case "chain-link": tap(N(5 + link * 2), 0, 0.03); break;
    default: break;
  }
};

/** Classic: the original handful of sounds. */
const classic: Themed = (a, t, name) => {
  const summon = () => { tone(a, t, 330, 160, { type: "triangle", gain: 0.06 }); tone(a, t + 0.08, 495, 200, { type: "triangle", gain: 0.05 }); };
  const chainS = () => { tone(a, t, 740, 110, { type: "triangle", gain: 0.05 }); tone(a, t + 0.06, 1110, 140, { type: "triangle", gain: 0.035 }); };
  if (name === "sum-set") { noise(a, t, 70, 900, 0.07); tone(a, t, 180, 90, { gain: 0.05 }); }
  else if (name.startsWith("sum-")) summon();
  else if (name.startsWith("act-") || name === "chain-link") chainS();
  // splashes and bosses were silent
};

const THEMES: Partial<Record<SoundTheme, Themed>> = { cinematic, retro, soft, classic };
// ---------------------------------------------------------------------------------------
// resolving effects (one per resolve animation style) and turn / phase cues, per theme

export type ResolveSound = "rings" | "sparkle" | "fireworks" | "aura" | "powerup" | "holy" | "void" | "electric" | "circle" | "frost" | "minimal";

/** The resolve sound for each resolve animation: what you hear matches what you see. Shared by the
 *  cinematic and arcane themes (cinematic leans lower and drier, arcane rings more). */
function resolveSound(a: AudioContext, t: number, style: ResolveSound, ringy: boolean) {
  const w = ringy ? 0.55 : 0.3;
  switch (style) {
    case "rings":   // shockwaves: low pulses spreading out
      [0, 0.12, 0.24].forEach((d, i) => { thump(a, t + d, 0.12 - i * 0.03, 130, 260); noise(a, t + d, 220, 900 - i * 200, 0.035, { type: "bandpass", sweep: 300, wet: w }); });
      break;
    case "sparkle":   // glints
      for (let i = 0; i < 6; i++) tone(a, t + i * 0.05 + Math.random() * 0.03, N(24 + ((i * 5) % 12)), 160, { type: "sine", gain: 0.022, wet: w, pan: Math.sin(i * 2.1) * 0.7, attack: 0.003 });
      break;
    case "fireworks":   // launch, then pops and crackle
      noise(a, t, 260, 600, 0.04, { sweep: 3500, attack: 0.8 });
      [0.28, 0.36, 0.47].forEach((d, i) => { noise(a, t + d, 120, 1800 + i * 600, 0.07, { type: "bandpass", q: 0.7, wet: w }); thump(a, t + d, 0.08, 160, 120); });
      for (let i = 0; i < 10; i++) noise(a, t + 0.5 + i * 0.035, 18, 5000, 0.025, { type: "highpass" });
      break;
    case "aura":   // a flame: a roaring, flickering band of noise
      noise(a, t, 800, 500, 0.06, { type: "bandpass", q: 0.6, attack: 0.25, wet: w });
      noise(a, t + 0.05, 700, 2500, 0.02, { type: "highpass", attack: 0.3 });
      break;
    case "powerup":   // charging up, then a crackle of lightning
      tone(a, t, N(-12), 700, { type: "sawtooth", gain: 0.022, to: N(12), attack: 0.2, wet: w });
      noise(a, t, 650, 300, 0.05, { sweep: 4000, attack: 0.8 });
      for (let i = 0; i < 6; i++) noise(a, t + 0.62 + i * 0.03, 25, 3000 + i * 500, 0.045, { type: "highpass" });
      break;
    case "holy":   // a bright, open chord with air
      [N(12), N(16), N(19), N(24)].forEach((f) => tone(a, t, f, 1200, { type: ringy ? "triangle" : "sine", gain: 0.016, attack: 0.15, wet: 0.7 }));
      noise(a, t, 1000, 6000, 0.02, { type: "highpass", attack: 0.3, wet: 0.5 });
      break;
    case "void":   // pulled into the dark: a sucking reverse swell and a low drop
      noise(a, t, 600, 3000, 0.06, { sweep: 120, attack: 0.9, wet: w });
      tone(a, t + 0.1, N(-17), 700, { type: "sine", gain: 0.06, to: N(-29), attack: 0.2 });
      break;
    case "electric":   // crackling arcs and a buzz
      tone(a, t, 110, 400, { type: "sawtooth", gain: 0.02, attack: 0.01 });
      for (let i = 0; i < 9; i++) noise(a, t + Math.random() * 0.4, 20 + Math.random() * 30, 2500 + Math.random() * 4000, 0.05, { type: "highpass" });
      break;
    case "circle":   // a magic circle humming as it turns
      [N(0), N(7)].forEach((f, i) => tone(a, t, f, 900, { type: "triangle", gain: 0.02, attack: 0.2, wet: w, detune: i ? 7 : -7 }));
      noise(a, t, 800, 1200, 0.025, { type: "bandpass", q: 6, sweep: 2400, attack: 0.3, wet: w });
      break;
    case "frost":   // ice forming: crisp tinkles and a cold breath
      noise(a, t, 500, 7000, 0.03, { type: "highpass", attack: 0.3, wet: w });
      for (let i = 0; i < 5; i++) tone(a, t + 0.05 + i * 0.07, N(31 + (i % 3) * 2), 180, { type: "sine", gain: 0.018, wet: 0.6, attack: 0.002, pan: (i - 2) * 0.3 });
      break;
    case "minimal": tone(a, t, N(7), 160, { type: "sine", gain: 0.03, wet: 0.2 }); break;
  }
}

type MomentFn = (a: AudioContext, t: number, name: Sfx) => boolean;
/** Turn / phase / resolve for a theme; false = not a moment this theme handles. */
const momentsFor: Record<SoundTheme, MomentFn> = {
  cinematic: (a, t, name) => {
    if (name.startsWith("resolve-")) { resolveSound(a, t, name.slice(8) as ResolveSound, false); return true; }
    switch (name) {
      case "turn-mine": whoosh(a, t, 500, 0.06); sub(a, t + 0.4, 0.22, 700); brass(a, t + 0.4, [N(-12), N(-5), N(0), N(4)], 900, 0.024, 0.5); return true;
      case "turn-theirs": whoosh(a, t, 500, 0.05, false); sub(a, t + 0.4, 0.2, 700); brass(a, t + 0.4, [N(-15), N(-8), N(-3)], 900, 0.022, 0.5, 1500); return true;
      case "phase-main1": case "phase-main2": whoosh(a, t, 280, 0.04); thump(a, t + 0.2, 0.1, 120, 200); return true;
      case "phase-battle": [0, 0.16, 0.32].forEach((d, i) => thump(a, t + d, 0.2 + i * 0.04, 110, 260)); brass(a, t + 0.32, [N(-17), N(-10), N(-5)], 700, 0.028); return true;
      case "phase-end": whoosh(a, t, 450, 0.05, false); tone(a, t + 0.1, N(-5), 600, { type: "sawtooth", gain: 0.012, to: N(-12), wet: 0.4, attack: 0.1 }); return true;
    }
    return false;
  },
  arcane: (a, t, name) => {
    if (name.startsWith("resolve-")) { resolveSound(a, t, name.slice(8) as ResolveSound, true); return true; }
    switch (name) {
      case "turn-mine": arp(a, t, [N(0), N(4), N(7), N(12)], 0.08, { gain: 0.04 }); bell(a, t + 0.32, N(24), 0.035, 1000); return true;
      case "turn-theirs": arp(a, t, [N(-3), N(0), N(4), N(9)], 0.08, { gain: 0.035 }); return true;
      case "phase-main1": case "phase-main2": bell(a, t, N(19), 0.035, 700); return true;
      case "phase-battle": bell(a, t, N(7), 0.04, 600); bell(a, t + 0.12, N(6), 0.04, 600); thump(a, t + 0.12, 0.12); return true;
      case "phase-end": bell(a, t, N(12), 0.03, 800); bell(a, t + 0.15, N(7), 0.03, 900); return true;
    }
    return false;
  },
  retro: (a, t, name) => {
    const run = (notes: number[], step: number, type: OscillatorType = "square", ms = 110) => notes.forEach((n, i) => chip(a, t + i * step, N(n), ms, type));
    if (name.startsWith("resolve-")) {
      const PAT: Record<ResolveSound, number[]> = { rings: [0, 7, 12], sparkle: [24, 28, 31, 36], fireworks: [12, 19, 24, 31], aura: [0, 3, 7], powerup: [0, 4, 7, 12, 16, 19], holy: [12, 16, 19, 24], void: [12, 7, 3, 0], electric: [24, 23, 24, 23], circle: [7, 12, 7, 12], frost: [31, 28, 31, 36], minimal: [12] };
      run(PAT[name.slice(8) as ResolveSound] ?? [12], 0.045);
      return true;
    }
    switch (name) {
      case "turn-mine": run([0, 4, 7, 12, 16], 0.07); return true;
      case "turn-theirs": run([0, 3, 7, 10], 0.07, "triangle", 140); return true;
      case "phase-main1": case "phase-main2": run([12, 19], 0.06); return true;
      case "phase-battle": run([0, 0, 7, 12], 0.07); chipNoise(a, t, 60); return true;
      case "phase-end": run([12, 7, 0], 0.07, "triangle", 140); return true;
    }
    return false;
  },
  soft: (a, t, name) => {
    const tap = (f: number, d = 0, g = 0.03) => tone(a, t + d, f, 150, { gain: g, attack: 0.004 });
    if (name.startsWith("resolve-")) { noise(a, t, 250, 1500, 0.025, { type: "lowpass" }); tap(N(12), 0.05, 0.025); return true; }
    switch (name) {
      case "turn-mine": tap(N(7)); tap(N(12), 0.1); return true;
      case "turn-theirs": tap(N(4)); tap(N(7), 0.1); return true;
      case "phase-main1": case "phase-main2": tap(N(12), 0, 0.025); return true;
      case "phase-battle": thump(a, t, 0.1, 110, 200); tap(N(0), 0.05); return true;
      case "phase-end": tap(N(7)); tap(N(0), 0.1, 0.025); return true;
    }
    return false;
  },
  classic: (a, t, name) => {
    if (name.startsWith("resolve-")) { tone(a, t, 520, 140, { type: "sine", gain: 0.04, to: 780 }); return true; }
    switch (name) {
      case "turn-mine": case "turn-theirs": tone(a, t, 392, 150, { gain: 0.05 }); tone(a, t + 0.12, 523, 220, { gain: 0.05 }); return true;
      case "phase-battle": noise(a, t, 180, 1200, 0.06); tone(a, t, 220, 220, { type: "sawtooth", gain: 0.03, to: 90 }); return true;
      case "phase-main1": case "phase-main2": case "phase-end": tone(a, t, 880, 60, { type: "triangle", gain: 0.04 }); return true;
    }
    return false;
  },
};

const THEMED = (name: Sfx) => name.startsWith("sum-") || name.startsWith("act-") || name === "splash" || name === "splash-big" || name === "boss" || name === "chain-link";

// ---------------------------------------------------------------------------------------

export interface PlayOpts {
  /** chain-link: which link (higher links ring higher) */
  link?: number;
  /** schedule it this many ms from now (in step with an animation) */
  inMs?: number;
}

export function play(name: Sfx, opts: PlayOpts = {}) {
  if (muted) return;
  if (opts.inMs && opts.inMs > 0) { setTimeout(() => play(name, { ...opts, inMs: 0 }), opts.inMs); return; }
  const key = name === "chain-link" ? `${name}:${opts.link}` : name;
  const now = performance.now();
  if (now - (lastAt.get(key) ?? 0) < 70) return;   // a batch of draws makes one sound per ~70 ms
  lastAt.set(key, now);
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.01;
  // summons, activations, splashes and the chain sound as the chosen theme ("arcane" is the set below)
  if (momentsFor[soundTheme](a, t, name)) return;   // turns, phases, resolving
  const themed = THEMES[soundTheme];
  if (themed && THEMED(name)) { themed(a, t, name, Math.max(1, Math.min(8, opts.link ?? 1))); return; }
  switch (name) {
    // ---- the basics
    case "draw": noise(a, t, 90, 2400, 0.05); break;
    case "pick": tone(a, t, 880, 60, { type: "triangle", gain: 0.04 }); break;
    case "shuffle": for (let i = 0; i < 4; i++) noise(a, t + i * 0.05, 50, 2000 + i * 300, 0.035); break;
    case "set": noise(a, t, 70, 900, 0.07); tone(a, t, 180, 90, { gain: 0.05 }); break;
    case "summon": tone(a, t, 330, 160, { type: "triangle", gain: 0.06 }); tone(a, t + 0.08, 495, 200, { type: "triangle", gain: 0.05 }); break;
    case "attack": noise(a, t, 180, 1200, 0.06); tone(a, t, 220, 220, { type: "sawtooth", gain: 0.03, to: 90 }); break;
    case "damage": tone(a, t, 160, 260, { type: "square", gain: 0.035, to: 70 }); noise(a, t, 120, 500, 0.06); thump(a, t, 0.12); break;
    case "gain": tone(a, t, 660, 120, { gain: 0.05, wet: 0.3 }); tone(a, t + 0.09, 990, 180, { gain: 0.04, wet: 0.3 }); break;
    case "chain": tone(a, t, 740, 110, { type: "triangle", gain: 0.05 }); tone(a, t + 0.06, 1110, 140, { type: "triangle", gain: 0.035 }); break;
    case "resolve": tone(a, t, 520, 140, { type: "sine", gain: 0.04, to: 780, wet: 0.3 }); break;
    case "turn": tone(a, t, 392, 150, { gain: 0.05, wet: 0.25 }); tone(a, t + 0.12, 523, 220, { gain: 0.05, wet: 0.25 }); break;
    case "win": [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.12, f, 320, { type: "triangle", gain: 0.06, wet: 0.4 })); shimmer(a, t + 0.4, 2093, 0.015, 1200); break;
    case "lose": [392, 330, 262].forEach((f, i) => tone(a, t + i * 0.16, f, 380, { type: "sine", gain: 0.05, wet: 0.4 })); break;

    // ---- summons: in step with each summon's look (summonFx.summon)
    case "sum-normal":   // the card lands: a body thump and a puff of dust
      thump(a, t, 0.2); noise(a, t, 260, 700, 0.07, { type: "lowpass", sweep: 200 }); noise(a, t + 0.02, 160, 3200, 0.025, { type: "highpass" });
      tone(a, t + 0.05, N(7), 240, { type: "triangle", gain: 0.03, wet: 0.2 });
      break;
    case "sum-tribute":   // heavier: two thumps, a rumble, a low horn
      thump(a, t, 0.28, 140, 380); thump(a, t + 0.09, 0.18, 90, 420); noise(a, t, 700, 300, 0.09, { type: "lowpass", sweep: 80, wet: 0.3 });
      tone(a, t + 0.05, N(-12), 700, { type: "sawtooth", gain: 0.03, to: N(-14), wet: 0.4, attack: 0.04 });
      break;
    case "sum-set":   // quiet: a card laid face-down
      noise(a, t, 90, 1100, 0.06, { type: "lowpass" }); tone(a, t, 150, 110, { gain: 0.05 });
      break;
    case "sum-flip":   // a flip and a reveal sting
      noise(a, t, 120, 1800, 0.05, { sweep: 4200 }); tone(a, t + 0.08, N(12), 200, { type: "triangle", gain: 0.04, wet: 0.3 }); tone(a, t + 0.14, N(19), 260, { type: "triangle", gain: 0.035, wet: 0.3 });
      break;
    case "sum-special":   // a rising magical arpeggio out of a whoosh
      noise(a, t, 600, 400, 0.05, { sweep: 3000, attack: 0.6, wet: 0.4 });
      arp(a, t + 0.18, [N(0), N(4), N(7), N(12), N(16)], 0.06, { gain: 0.04 });
      shimmer(a, t + 0.45, 1568, 0.014, 700);
      break;
    case "sum-ritual":   // a solemn minor pad and a bell
      [N(-3), N(0), N(4), N(9)].forEach((f) => tone(a, t, f, 1400, { type: "sawtooth", gain: 0.012, wet: 0.7, attack: 0.25, detune: 6 }));
      bell(a, t + 0.35, N(21), 0.05, 1400);
      break;
    case "sum-fusion":   // a swirl that pulls in (filter sweeping up and down), then a chord bursts out
      noise(a, t, 750, 250, 0.07, { sweep: 2600, q: 4, attack: 0.7, wet: 0.4 });
      tone(a, t, N(-5), 750, { type: "sawtooth", gain: 0.015, to: N(7), wet: 0.4, attack: 0.5 });
      [N(0), N(3), N(7), N(10)].forEach((f) => tone(a, t + 0.74, f, 900, { type: "triangle", gain: 0.035, wet: 0.5 }));
      thump(a, t + 0.74, 0.16); noise(a, t + 0.74, 300, 2000, 0.05, { type: "highpass" });
      break;
    case "sum-synchro":   // three rings ping upward, then a bright beam
      [N(12), N(16), N(19)].forEach((f, i) => bell(a, t + i * 0.11, f, 0.035, 700));
      tone(a, t + 0.42, N(24), 700, { type: "sawtooth", gain: 0.018, to: N(31), wet: 0.6, attack: 0.02 });
      noise(a, t + 0.42, 500, 5000, 0.04, { type: "highpass", wet: 0.5 });
      shimmer(a, t + 0.5, 2093, 0.016, 900);
      break;
    case "sum-xyz":   // a deep rumble, orbiting shimmer, then a dark impact
      tone(a, t, 55, 1100, { type: "sawtooth", gain: 0.03, to: 70, wet: 0.4, attack: 0.15 });
      noise(a, t, 1000, 180, 0.07, { type: "lowpass", wet: 0.4, attack: 0.3 });
      for (let i = 0; i < 6; i++) tone(a, t + 0.15 + i * 0.11, N(19 + (i % 3) * 2), 220, { gain: 0.02, wet: 0.6, pan: Math.sin(i * 1.3) * 0.7 });
      thump(a, t + 0.9, 0.26, 110, 500); [N(-12), N(-5), N(3)].forEach((f) => tone(a, t + 0.9, f, 900, { type: "triangle", gain: 0.03, wet: 0.5 }));
      break;
    case "sum-link":   // digital blips per arrow, then a snap into place
      [N(19), N(24), N(22), N(26)].forEach((f, i) => tone(a, t + i * 0.08, f, 70, { type: "square", gain: 0.022, pan: (i % 2 ? 0.4 : -0.4) }));
      tone(a, t + 0.4, N(7), 180, { type: "sawtooth", gain: 0.025, to: N(19) });
      noise(a, t + 0.52, 60, 3000, 0.07, { type: "highpass" }); thump(a, t + 0.52, 0.14, 160, 200);
      break;
    case "sum-pendulum":   // a swinging glide, side to side
      tone(a, t, N(7), 360, { type: "sine", gain: 0.04, to: N(14), wet: 0.4, pan: -0.6 });
      tone(a, t + 0.33, N(14), 360, { type: "sine", gain: 0.04, to: N(7), wet: 0.4, pan: 0.6 });
      tone(a, t + 0.66, N(7), 360, { type: "sine", gain: 0.035, to: N(12), wet: 0.4, pan: -0.3 });
      thump(a, t + 0.42, 0.14);
      break;

    // ---- activations (summonFx.activate)
    case "act-spell":   // a bright chime with runes sparkling
      bell(a, t, N(24), 0.05, 1000); bell(a, t + 0.07, N(31), 0.03, 900); shimmer(a, t + 0.1, 2637, 0.012, 700);
      break;
    case "act-quick":   // fast: a whip and a quick chime
      noise(a, t, 140, 1500, 0.06, { sweep: 6000 }); bell(a, t + 0.06, N(28), 0.045, 600);
      break;
    case "act-trap":   // a trap springs: a hard snap and a low hit
      noise(a, t, 50, 3500, 0.09, { type: "highpass" }); thump(a, t, 0.2, 150, 240);
      tone(a, t, N(-1), 260, { type: "square", gain: 0.03, to: N(-13), wet: 0.3 }); tone(a, t + 0.03, N(6), 200, { type: "sawtooth", gain: 0.02, wet: 0.3 });
      break;
    case "act-counter":   // a shield: a metallic clang
      clang(a, t, N(7), 0.04); thump(a, t, 0.14, 130, 200);
      break;
    case "act-monster":   // power rising
      tone(a, t, N(-12), 650, { type: "sawtooth", gain: 0.025, to: N(0), wet: 0.4, attack: 0.15 });
      noise(a, t, 600, 300, 0.05, { sweep: 2200, attack: 0.5, wet: 0.3 });
      tone(a, t + 0.4, N(12), 300, { type: "triangle", gain: 0.03, wet: 0.4 });
      break;

    // ---- moments
    case "splash":   // the card art sweeps in
      noise(a, t, 420, 600, 0.06, { sweep: 4000, attack: 0.4, wet: 0.3 }); tone(a, t + 0.25, N(19), 400, { type: "triangle", gain: 0.03, wet: 0.5 });
      break;
    case "splash-big":   // a legendary card: a boom and a choir-like shimmer
      noise(a, t, 500, 500, 0.07, { sweep: 4500, attack: 0.45, wet: 0.4 });
      thump(a, t + 0.3, 0.3, 90, 700); [N(-12), N(-5), N(0), N(4)].forEach((f) => tone(a, t + 0.3, f, 1400, { type: "sawtooth", gain: 0.013, wet: 0.7, attack: 0.2, detune: 5 }));
      shimmer(a, t + 0.35, 1760, 0.016, 1300);
      break;
    case "boss":   // a boss monster lands
      thump(a, t, 0.32, 80, 900); noise(a, t, 900, 140, 0.09, { type: "lowpass", wet: 0.5 });
      break;
    case "chain-link": {   // each link a step higher
      const k = Math.max(1, Math.min(8, opts.link ?? 1));
      const f = N([7, 9, 11, 12, 14, 16, 17, 19][k - 1]);
      bell(a, t, f, 0.04, 700, 0.45); tone(a, t, f / 2, 300, { type: "triangle", gain: 0.025 });
      break;
    }
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
