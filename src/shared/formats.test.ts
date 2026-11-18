import { expect, it } from "vitest";
import { genesysExcluded, genesysPoints, genesysSummary } from "./formats.ts";
import { unknownCard } from "./library.ts";
import { GENESYS_POINTS } from "./genesysPoints.ts";
import type { Card } from "./types.ts";
const card = (name: string, type = "Effect Monster"): Card => ({ ...unknownCard(1), name, type, category: "Monster" });

it("counts each copy across Main, Extra and Side, retaining unknowns", () => {
  const cards = [card("Ash Blossom & Joyous Spring"), card("Baronne de Fleur"), unknownCard(3)];
  expect(genesysSummary({ main: [0, 0], extra: [1], side: [0, 2] }, (id) => cards[id])).toEqual({ main: 36, extra: 50, side: 18, total: 104, unknown: 1 });
});
it("distinguishes zero-point cards from unresolved cards", () => {
  expect(genesysPoints(card("Blue-Eyes White Dragon"))).toBe(0);
  expect(genesysPoints(unknownCard(42))).toBeNull();
  expect(genesysPoints(card("ASH BLOSSOM & JOYOUS SPRING"))).toBe(18);
});
it("excludes Links and Pendulums without excluding other Extra Deck types", () => {
  expect(genesysExcluded(card("Link", "Link Monster"))).toBe(true);
  expect(genesysExcluded(card("Pendulum", "Pendulum Effect Fusion Monster"))).toBe(true);
  expect(genesysExcluded(card("Synchro", "Synchro Monster"))).toBe(false);
});
it("includes the latest MAMS additions and matches catalogue punctuation", () => {
  expect(genesysPoints(card("Red Nova Dragon - Burning Soul"))).toBe(20);
  expect(genesysPoints(card("Reincarnation of the Unchained"))).toBe(7);
});
it("ships a complete nonnegative official snapshot", () => {
  expect(Object.keys(GENESYS_POINTS).length).toBeGreaterThan(500);
  expect(Object.values(GENESYS_POINTS).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
});
