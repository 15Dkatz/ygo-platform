// A random-but-legal player: answers any EnginePrompt with a valid EngineResponse. Used by the
// engine tests; also usable as a placeholder AI opponent. Biased towards making progress
// (summon, attack, activate) so duels between two bots actually end.

import type { EnginePrompt, EngineResponse, EnginePlace } from "../../../shared/enginePrompts.ts";

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so test duels are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const pickIndex = (rng: Rng, n: number) => Math.floor(rng() * n);
function sample(rng: Rng, n: number, k: number): number[] {
  const ix = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = pickIndex(rng, i + 1); [ix[i], ix[j]] = [ix[j], ix[i]]; }
  return ix.slice(0, k);
}

export function botResponse(p: EnginePrompt, rng: Rng): EngineResponse {
  const promptId = p.id;
  switch (p.kind) {
    case "idle": {
      const options: EngineResponse[] = [];
      const add = (action: "summon" | "specialSummon" | "reposition" | "monsterSet" | "spellSet" | "activate", n: number, weight: number) => {
        for (let i = 0; i < n; i++) for (let w = 0; w < weight; w++) options.push({ promptId, kind: "idle", action, index: i });
      };
      add("summon", p.summons.length, 4);
      add("specialSummon", p.specialSummons.length, 4);
      add("activate", p.activates.length, 2);
      add("spellSet", p.spellSets.length, 1);
      add("monsterSet", p.monsterSets.length, 1);
      add("reposition", p.repositions.length, 1);
      if (p.canBattle) for (let w = 0; w < 3; w++) options.push({ promptId, kind: "idle", action: "battle" });
      if (p.canEnd) options.push({ promptId, kind: "idle", action: "end" });
      return options.length ? pick(rng, options) : { promptId, kind: "idle", action: "end" };
    }
    case "battle": {
      // forced attacks (some effects): neither Main Phase 2 nor End is allowed, so attack or activate
      const mustAct = !p.canMain2 && !p.canEnd;
      if (p.attacks.length && (mustAct || rng() < 0.85)) return { promptId, kind: "battle", action: "attack", index: pickIndex(rng, p.attacks.length) };
      if (mustAct && p.activates.length) return { promptId, kind: "battle", action: "activate", index: pickIndex(rng, p.activates.length) };
      if (p.activates.length && rng() < 0.3) return { promptId, kind: "battle", action: "activate", index: pickIndex(rng, p.activates.length) };
      if (p.canMain2 && rng() < 0.5) return { promptId, kind: "battle", action: "main2" };
      return p.canEnd ? { promptId, kind: "battle", action: "end" } : { promptId, kind: "battle", action: "main2" };
    }
    case "effectYesNo": return { promptId, kind: "effectYesNo", yes: rng() < 0.8 };
    case "yesNo": return { promptId, kind: "yesNo", yes: rng() < 0.6 };
    case "option": return { promptId, kind: "option", index: pickIndex(rng, p.options.length) };
    case "selectCard": {
      const k = p.min + pickIndex(rng, Math.min(p.max, p.cards.length) - p.min + 1);
      return { promptId, kind: "selectCard", indices: sample(rng, p.cards.length, k) };
    }
    case "selectTribute": {
      // pick cards until their release values cover `min`
      const order = sample(rng, p.cards.length, p.cards.length);
      const chosen: number[] = [];
      let total = 0;
      for (const i of order) { if (total >= p.min) break; chosen.push(i); total += p.cards[i].value || 1; }
      return { promptId, kind: "selectTribute", indices: chosen };
    }
    case "selectUnselect": {
      if (p.selected.length >= p.min && (p.canFinish || p.cards.length === 0) && (rng() < 0.5 || !p.cards.length || p.selected.length >= p.max)) {
        return { promptId, kind: "selectUnselect", index: null };
      }
      if (!p.cards.length) return { promptId, kind: "selectUnselect", index: p.canCancel || p.canFinish ? null : 0 };
      return { promptId, kind: "selectUnselect", index: pickIndex(rng, p.cards.length) };
    }
    case "selectChain":
      if (!p.cards.length || (!p.forced && rng() < 0.4)) return { promptId, kind: "selectChain", index: p.forced && p.cards.length ? 0 : null };
      return { promptId, kind: "selectChain", index: pickIndex(rng, p.cards.length) };
    case "selectPlace": {
      // prefer our own zones (the first ones listed are the prompted player's)
      const own = p.places.filter((x) => x.controller === p.player);
      const pool = (p.disabling ? p.places.filter((x) => x.controller !== p.player) : own).length
        ? (p.disabling ? p.places.filter((x) => x.controller !== p.player) : own) : p.places;
      const places: EnginePlace[] = sample(rng, pool.length, p.count).map((i) => pool[i]);
      return { promptId, kind: "selectPlace", places };
    }
    case "selectPosition": return { promptId, kind: "selectPosition", position: pick(rng, p.positions) };
    case "selectSum": {
      // greedy random subset hitting the target exactly (or at least, when !exact)
      const mustTotal = p.must.reduce((s, c) => s + (c.value & 0xffff), 0);
      for (let tries = 0; tries < 200; tries++) {
        const order = sample(rng, p.cards.length, p.cards.length);
        let total = mustTotal; const chosen: number[] = [];
        for (const i of order) {
          if (total >= p.target) break;
          const v = p.cards[i].value & 0xffff, v2 = p.cards[i].value >>> 16;
          if (total + v <= p.target || !p.exact) { chosen.push(i); total += v; }
          else if (v2 && total + v2 <= p.target) { chosen.push(i); total += v2; }
        }
        if (p.exact ? total === p.target : total >= p.target) return { promptId, kind: "selectSum", indices: chosen };
      }
      return { promptId, kind: "selectSum", indices: [...p.cards.keys()] };
    }
    case "selectCounter": {
      let left = p.count;
      const counts = p.cards.map((c) => { const n = Math.min(left, c.available); left -= n; return n; });
      return { promptId, kind: "selectCounter", counts };
    }
    case "sort": return { promptId, kind: "sort", order: null };
    case "rps": return { promptId, kind: "rps", choice: pick(rng, ["rock", "paper", "scissors"] as const) };
    case "announceNumber": return { promptId, kind: "announceNumber", index: pickIndex(rng, p.options.length) };
    case "announceRace": return { promptId, kind: "announceRace", values: sample(rng, p.available.length, p.count).map((i) => p.available[i]) };
    case "announceAttribute": return { promptId, kind: "announceAttribute", values: sample(rng, p.available.length, p.count).map((i) => p.available[i]) };
    case "announceCard": return { promptId, kind: "announceCard", code: 89631139 };
  }
}
