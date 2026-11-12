import { describe, expect, it } from "vitest";
import { skillCardProblem, TYPE_SKILL } from "./deckCheck.ts";

/** A stand-in for D1 that knows a few engine_cards rows and answers the skill query. */
function fakeDb(rows: { id: number; name: string; type: number }[], fail = false) {
  return {
    prepare: (sql: string) => ({
      bind: (...ids: number[]) => ({
        all: async () => {
          if (fail) throw new Error("D1 down");
          expect(sql).toContain("'Skill Card'");          // the catalogue's marker
          expect(sql).toContain(String(TYPE_SKILL));        // the engine's type bit
          return { results: rows.filter((r) => ids.includes(r.id) && r.type & TYPE_SKILL).map(({ id, name }) => ({ id, name })) };
        },
      }),
    }),
  } as unknown as D1Database;
}

const CARDS = [
  { id: 1, name: "Cold-Blooded Tactician", type: TYPE_SKILL | 0x2 },
  { id: 2, name: "Dark Hole", type: 0x2 },
  { id: 3, name: "Blue-Eyes White Dragon", type: 0x11 },
];

describe("Skill cards in rules-enforced decks", () => {
  it("rejects a deck with a Skill card, naming it", async () => {
    const err = await skillCardProblem(fakeDb(CARDS), { main: [3, 3, 2, 1], extra: [] });
    expect(err).toMatch(/Skill cards can't be used/);
    expect(err).toContain("Cold-Blooded Tactician");
  });
  it("accepts a deck without Skill cards", async () => {
    expect(await skillCardProblem(fakeDb(CARDS), { main: [3, 3, 2], extra: [], side: [2] })).toBeNull();
  });
  it("lets the duel go ahead if the lookup itself fails", async () => {
    expect(await skillCardProblem(fakeDb(CARDS, true), { main: [1], extra: [] })).toBeNull();
  });
});
