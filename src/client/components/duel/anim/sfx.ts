// Synthesized sound effects (Web Audio API: oscillators, filtered noise, a shared reverb; no audio files).
// On by default, quiet, muted with a toggle and a volume slider, both remembered in localStorage.
//
// The basics (draw, set, attack, damage, ...) plus a sound per kind of summon and activation, the card-art
// splash and the chain, so each animation has its own voice (anim/summonFx.ts plays them in step), in one of
// several themes (cinematic, arcane, retro, soft, classic) picked in the duel settings.

// Layout: sound/synth.ts (context, buses, building blocks), sound/themes.ts (per-theme sounds); this file
// is play(), the music loop and the public API.

export { isMuted, getBusVolume, setBusVolume, getVolume, setVolume, setMuted, onMuteChange } from "./sound/synth.ts";
export type { Sfx, SoundBus } from "./sound/synth.ts";
export { SOUND_THEMES, SOUND_THEME_LABEL, getSoundTheme, setSoundTheme } from "./sound/themes.ts";
export type { SoundTheme, ResolveSound } from "./sound/themes.ts";
import { N, arp, audio, bell, busVol, clang, lastAt, muted, noise, setBus, shimmer, thump, tone } from "./sound/synth.ts";
import type { Sfx } from "./sound/synth.ts";
import { THEMED, THEMES, chip, getSoundTheme, momentsFor } from "./sound/themes.ts";
import type { SoundTheme } from "./sound/themes.ts";


// ---------------------------------------------------------------------------------------

export interface PlayOpts {
  /** chain-link: which link (higher links ring higher) */
  link?: number;
  /** schedule it this many ms from now (in step with an animation) */
  inMs?: number;
}

/** Sounds scheduled for later (in step with an animation) are dropped when the animation is skipped. */
let generation = 0;
export function cancelScheduled() { generation++; }

/** Interface sounds (picks, draws, turn and phase cues); the rest are card effects. */
const UI_SOUNDS = new Set<string>(["pick", "draw", "shuffle", "turn", "turn-mine", "turn-theirs", "phase-main1", "phase-battle", "phase-main2", "phase-end", "chain", "win", "lose"]);

export function play(name: Sfx, opts: PlayOpts = {}) {
  if (muted) return;
  if (opts.inMs && opts.inMs > 0) {
    const gen = generation;
    setTimeout(() => { if (gen === generation) play(name, { ...opts, inMs: 0 }); }, opts.inMs);
    return;
  }
  const key = name === "chain-link" ? `${name}:${opts.link}` : name;
  const now = performance.now();
  if (now - (lastAt.get(key) ?? 0) < 70) return;   // a batch of draws makes one sound per ~70 ms
  lastAt.set(key, now);
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.01;
  setBus(UI_SOUNDS.has(name) ? "ui" : "fx");
  // summons, activations, splashes and the chain sound as the chosen theme ("arcane" is the set below)
  if (momentsFor[getSoundTheme()](a, t, name)) return;   // turns, phases, resolving
  const themed = THEMES[getSoundTheme()];
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

// ---------------------------------------------------------------------------------------
// background music: a generated loop in the sound theme's mood (off until its volume is raised)

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
/** Chords (semitones from C4) per theme, one per bar; null = no music in that theme. */
const MUSIC: Record<SoundTheme, { chords: number[][]; bar: number; voice: "pad" | "bells" | "chip" | "soft" } | null> = {
  cinematic: { chords: [[-12, -5, 0, 3], [-16, -9, -4, 0], [-19, -12, -7, -3], [-14, -7, -2, 2]], bar: 4, voice: "pad" },
  arcane: { chords: [[0, 4, 7, 11], [-3, 0, 4, 9], [-7, -3, 0, 5], [-5, -1, 2, 7]], bar: 3.2, voice: "bells" },
  retro: { chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], bar: 1.6, voice: "chip" },
  soft: { chords: [[0, 7, 16], [-3, 4, 12], [-7, 5, 9], [-5, 2, 11]], bar: 5, voice: "soft" },
  classic: null,
};
function musicBar(a: AudioContext) {
  const m = MUSIC[getSoundTheme()];
  if (!m || busVol.music <= 0 || muted) return;
  setBus("music");
  const t = a.currentTime + 0.05, chord = m.chords[musicStep % m.chords.length];
  musicStep++;
  switch (m.voice) {
    case "pad": chord.forEach((n, i) => tone(a, t, N(n), m.bar * 1000 + 600, { type: "sawtooth", gain: 0.006, attack: 1.2, wet: 0.8, detune: (i - 1.5) * 6 })); tone(a, t, N(chord[0] - 12), m.bar * 1000, { gain: 0.02, attack: 0.8 }); break;
    case "bells": chord.forEach((n, i) => bell(a, t + i * (m.bar / chord.length), N(n + 12), 0.012, 1600, 0.7)); tone(a, t, N(chord[0] - 12), m.bar * 1000, { type: "triangle", gain: 0.01, attack: 0.6, wet: 0.5 }); break;
    case "chip": for (let k = 0; k < 8; k++) chip(a, t + k * (m.bar / 8), N(chord[k % chord.length] + (k >= 4 ? 12 : 0)), 120, "square", 0.008); chip(a, t, N(chord[0] - 12), m.bar * 1000 * 0.9, "triangle", 0.02); break;
    case "soft": chord.forEach((n) => tone(a, t, N(n), m.bar * 1000 + 800, { gain: 0.006, attack: 1.6, wet: 0.7 })); break;
  }
  setBus("fx");
}
/** Start / stop the music loop (the duel page runs it while a duel is live). */
export function setMusic(on: boolean) {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!on) return;
  const tick = () => { const a = audio(); if (a && a.state === "running") musicBar(a); };
  const m = MUSIC[getSoundTheme()];
  tick();
  musicTimer = setInterval(tick, (m?.bar ?? 4) * 1000);
}
