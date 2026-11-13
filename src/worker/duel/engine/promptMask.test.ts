import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";
import { maskPrompt } from "./promptMask.ts";

describe("prompt masking", () => {
  const prompt = {
    id: 1, player: 0, kind: "selectCard", min: 1, max: 1, canCancel: false,
    cards: [
      { code: 111, controller: 1, location: "spelltrap", sequence: 0, position: "faceDown" },     // opponent's set card
      { code: 222, controller: 1, location: "monster", sequence: 1, position: "faceDownDef" },    // opponent's set monster
      { code: 333, controller: 1, location: "monster", sequence: 2, position: "atk" },           // opponent's face-up monster
      { code: 444, controller: 1, location: "hand", sequence: 0 },                               // opponent's hand
      { code: 555, controller: 0, location: "spelltrap", sequence: 0, position: "faceDown" },    // my own set card
      { code: 666, controller: 0, location: "deck", sequence: 3 },                               // my Deck (searching)
      { code: 777, controller: 1, location: "gy", sequence: 0 },                                 // public
    ],
  } as unknown as EnginePrompt;

  it("blanks the opponent's hidden cards and keeps everything else", () => {
    const m = maskPrompt(prompt) as unknown as { cards: { code: number }[] };
    expect(m.cards.map((c) => c.code)).toEqual([0, 0, 333, 0, 555, 666, 777]);
  });
  it("doesn't change the original prompt", () => {
    maskPrompt(prompt);
    expect((prompt as unknown as { cards: { code: number }[] }).cards[0].code).toBe(111);
  });
  it("shows picks from the opponent's Deck (you look at them to choose)", () => {
    const pick = { id: 2, player: 0, kind: "selectCard", min: 1, max: 1, canCancel: false,
      cards: [{ code: 901, controller: 1, location: "deck", sequence: 5 }, { code: 902, controller: 1, location: "deck", sequence: 6 }] } as unknown as EnginePrompt;
    expect((maskPrompt(pick) as unknown as { cards: { code: number }[] }).cards.map((c) => c.code)).toEqual([901, 902]);
  });
  it("shows the opponent's hand cards only when they were revealed to you", () => {
    const m = maskPrompt(prompt, 0, new Set(["1:hand:444"])) as unknown as { cards: { code: number }[] };
    expect(m.cards[3].code).toBe(444);
    expect(m.cards[0].code).toBe(0);   // a set card stays hidden
  });
});

describe("reveals in events", () => {
  it("keeps a private look at a Deck private, and an excavation public", async () => {
    const { eventsFor } = await import("./EngineDuel.ts");
    const look = { e: "confirm", player: 0, public: false, cards: [{ code: 5, controller: 0, location: "deck", sequence: 0 }] } as const;
    const dig = { e: "confirm", player: 0, public: true, cards: [{ code: 6, controller: 0, location: "deck", sequence: 0 }] } as const;
    const [a, b] = eventsFor([look, dig] as never, 1) as unknown as { cards: { code: number }[] }[];
    expect(a.cards[0].code).toBe(0);
    expect(b.cards[0].code).toBe(6);
    expect((eventsFor([look] as never, 0)[0] as unknown as { cards: { code: number }[] }).cards[0].code).toBe(5);
  });
  it("an excavated card's next move is public", async () => {
    const { eventsFor } = await import("./EngineDuel.ts");
    const move = { e: "move", code: 6, from: { code: 6, controller: 0, location: "deck", sequence: 0 }, to: { code: 6, controller: 0, location: "hand", sequence: 2 } };
    expect((eventsFor([move] as never, 1)[0] as { code: number }).code).toBe(0);
    expect((eventsFor([move] as never, 1, new Set(["0:6"]))[0] as { code: number }).code).toBe(6);
  });
});
