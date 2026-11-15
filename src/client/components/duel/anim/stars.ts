// How much of a moment a card deserves: which cards get the card-art splash when they're summoned,
// activated or attack. Three levels:
//   3 "legendary": iconic cards and the game's power cards (huge popularity, staples, banned / limited)
//   2 "notable":   popular cards, staples, cards strong enough to be on a ban list
//   1 everyone else (their summons / activations still play their effects, just no splash)
//
// From the catalogue's own data: YGOPRODeck view counts (how much people look a card up: a good proxy
// for "everyone knows this card"), its staple flag, the TCG / OCG ban lists, plus a list of icons.
import type { Card } from "../../../../shared/types.ts";

export type Stars = 1 | 2 | 3;

/** Cards that are a moment no matter what the numbers say. */
const ICONIC = new Set([
  "blue-eyes white dragon", "dark magician", "dark magician girl", "red-eyes black dragon", "exodia the forbidden one",
  "slifer the sky dragon", "obelisk the tormentor", "the winged dragon of ra", "black luster soldier", "black luster soldier - envoy of the beginning",
  "blue-eyes ultimate dragon", "summoned skull", "kuriboh", "stardust dragon", "number 39: utopia", "elemental hero neos",
  "cyber dragon", "cyber end dragon", "elemental hero flame wingman", "dark armed dragon", "judgment dragon", "chaos emperor dragon - envoy of the end",
  "firewall dragon", "accesscode talker", "decode talker", "odd-eyes pendulum dragon", "red dragon archfiend", "black rose dragon",
  "monster reborn", "pot of greed", "raigeki", "dark hole", "harpie's feather duster", "mirror force", "change of heart", "graceful charity",
  "polymerization", "swords of revealing light", "solemn judgment", "magic cylinder", "torrential tribute", "heavy storm",
  "time wizard", "jinzo", "buster blader", "gate guardian", "the seal of orichalcos", "fallen of albaz", "mirrorjade the iceblade dragon",
]);

const VIEWS: [number, number][] = [[3_000_000, 3], [1_000_000, 2], [400_000, 1]];

/** The card's level of fame (3 = always a moment, 2 = a moment, 1 = routine). */
export function cardStars(card: Card | null | undefined): Stars {
  if (!card) return 1;
  let score = 0;
  if (ICONIC.has(card.name.toLowerCase())) score += 4;
  const v = card.views ?? 0;
  score += VIEWS.find(([n]) => v >= n)?.[1] ?? 0;
  if (card.staple) score += 2;
  const bans = [card.ban_tcg, card.ban_ocg].map((b) => (b ?? "").toLowerCase());
  score += bans.includes("forbidden") ? 2 : bans.some((b) => b === "limited" || b === "semi-limited") ? 1 : 0;
  return score >= 4 ? 3 : score >= 2 ? 2 : 1;
}

/** A short word for the splash plate: why this card is a moment. */
export function starLabel(card: Card | null | undefined): string | null {
  if (!card) return null;
  if (ICONIC.has(card.name.toLowerCase())) return "Legendary";
  const bans = [card.ban_tcg, card.ban_ocg].map((b) => (b ?? "").toLowerCase());
  if (bans.includes("forbidden")) return "Forbidden-class";
  if (card.staple) return "Staple";
  return cardStars(card) === 3 ? "Fan favourite" : null;
}
