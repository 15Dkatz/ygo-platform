// What kind of effect a card has (for its activation / resolution visual), and how a monster
// attacks (attribute + type). Heuristics on the card text, reusing the library's tag patterns,
// plus a small override map for famous staples. Only ever called with codes the viewer can see.

import { isHandtrap, TAG_PATTERNS } from "../../../../shared/library.ts";
import type { Card } from "../../../../shared/types.ts";

export type EffectKind = "wipe" | "trapHole" | "negate" | "destroy" | "banish" | "bounce" | "search" | "revive" | "burn" | "handtrap" | "generic";

const OVERRIDES: Record<string, EffectKind> = {
  "dark hole": "wipe", "raigeki": "wipe", "torrential tribute": "wipe", "harpie's feather duster": "wipe", "heavy storm": "wipe",
  "evenly matched": "wipe", "lightning storm": "wipe", "black rose dragon": "wipe", "judgment dragon": "wipe",
  "trap hole": "trapHole", "bottomless trap hole": "trapHole", "traptrix trap hole nightmare": "trapHole", "mirror force": "trapHole",
  "sakuretsu armor": "trapHole", "compulsory evacuation device": "bounce", "dimensional prison": "trapHole", "time-space trap hole": "trapHole",
  "solemn judgment": "negate", "solemn strike": "negate", "solemn warning": "negate", "ash blossom & joyous spring": "negate",
  "effect veiler": "negate", "infinite impermanence": "negate", "called by the grave": "negate", "magic jammer": "negate",
  "seven tools of the bandit": "negate", "negate attack": "negate", "book of moon": "generic",
  "mystical space typhoon": "destroy", "twin twisters": "destroy", "dust tornado": "destroy", "fissure": "destroy", "hammer shot": "destroy",
  "monster reborn": "revive", "call of the haunted": "revive", "premature burial": "revive",
  "pot of greed": "search", "pot of desires": "search", "pot of prosperity": "search", "reinforcement of the army": "search",
  "ookazi": "burn", "magic cylinder": "burn", "hinotama": "burn",
};

const cache = new Map<number, EffectKind>();

export function effectKind(card: Card | null): EffectKind {
  if (!card) return "generic";
  const hit = cache.get(card.id);
  if (hit) return hit;
  const name = card.name.toLowerCase();
  const desc = card.desc ?? "";
  const tag = (t: string) => TAG_PATTERNS.find(([k]) => k === t)![1].test(desc);
  const kind: EffectKind = OVERRIDES[name]
    ?? (isHandtrap(card) ? "handtrap"
      : tag("board-wipe") ? "wipe"
      : /when (your )?opponent('s)? (normal |flip |special )?summons?|when an? (opponent's )?monster (is )?(normal |flip |special )?summoned|declares an attack/i.test(desc) && /\b(destroy|banish)\b/i.test(desc) ? "trapHole"
      : tag("negate") ? "negate"
      : tag("revive") ? "revive"
      : tag("burn") ? "burn"
      : tag("searcher") || tag("draw") ? "search"
      : /\bbanish\b/i.test(desc) ? "banish"
      : /return[^.;]{0,60}to the (hand|Deck)/i.test(desc) ? "bounce"
      : /\bdestroy\b/i.test(desc) ? "destroy"
      : "generic");
  cache.set(card.id, kind);
  return kind;
}

export type AttackElement = "fire" | "water" | "wind" | "earth" | "light" | "dark" | "divine" | "none";
export type AttackShape = "breath" | "orb" | "slash" | "laser" | "pounce" | "claw" | "lunge";

export function attackStyle(card: Card | null): { element: AttackElement; shape: AttackShape } {
  const a = (card?.attribute ?? "").toLowerCase();
  const element = (["fire", "water", "wind", "earth", "light", "dark", "divine"] as const).find((x) => x === a) ?? "none";
  const r = (card?.race ?? "").toLowerCase();
  const shape: AttackShape = /dragon|wyrm|sea serpent/.test(r) ? "breath"
    : /spellcaster|fairy|psychic/.test(r) ? "orb"
    : /warrior/.test(r) ? "slash"
    : /machine|cyberse|thunder/.test(r) ? "laser"
    : /beast|dinosaur|insect|reptile/.test(r) ? "pounce"
    : /fiend|zombie/.test(r) ? "claw"
    : "lunge";
  return { element, shape };
}
