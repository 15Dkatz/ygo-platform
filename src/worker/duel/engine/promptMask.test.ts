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
});
