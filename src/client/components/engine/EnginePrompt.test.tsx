// Renders the prompt panel (server-side, no browser) for every prompt kind real duels produce,
// plus hand-written prompts for the kinds simple decks never reach.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";

vi.mock("./EnginePrompt.css", () => ({}));
const { EnginePromptPanel } = await import("./EnginePrompt.tsx");

const card = { code: 89631139, controller: 0 as const, location: "hand" as const, sequence: 0 };
const base = { id: 1, player: 0 as const };
const handMade: EnginePrompt[] = [
  { ...base, kind: "rps" },
  { ...base, kind: "selectSum", target: 8, exact: true, min: 1, max: 3, must: [], cards: [{ ...card, value: 4 }, { ...card, value: 4 }] },
  { ...base, kind: "selectCounter", counterType: 1, count: 2, cards: [{ ...card, available: 3 }] },
  { ...base, kind: "announceRace", count: 1, available: [1, 2, 8192] },
  { ...base, kind: "announceAttribute", count: 1, available: [16, 32] },
  { ...base, kind: "announceNumber", options: [1, 2, 3] },
  { ...base, kind: "announceCard" },
  { ...base, kind: "sort", chain: true, cards: [card] },
  { ...base, kind: "selectUnselect", min: 1, max: 2, canFinish: true, canCancel: false, cards: [card], selected: [card] },
  { ...base, kind: "selectPosition", code: 89631139, positions: ["atk", "faceDownDef"] },
  { ...base, kind: "effectYesNo", card, desc: "Draw 2 cards" },
  { ...base, kind: "option", options: ["A", "B"] },
  { ...base, kind: "selectTribute", min: 2, max: 2, canCancel: true, cards: [{ ...card, value: 1 }] },
];

describe("EnginePromptPanel", () => {
  it("renders every prompt kind", () => {
    for (const p of handMade) {
      const html = renderToStaticMarkup(<EnginePromptPanel prompt={p} onRespond={() => {}} cardName={() => "Blue-Eyes White Dragon"} />);
      expect(html, p.kind).toContain("engine-prompt");
      expect(html.length, p.kind).toBeGreaterThan(80);
    }
  });
  it("renders a Main Phase prompt with its actions", () => {
    const html = renderToStaticMarkup(<EnginePromptPanel onRespond={() => {}} prompt={{
      ...base, kind: "idle", summons: [card], specialSummons: [], repositions: [], monsterSets: [card], spellSets: [],
      activates: [{ ...card, code: 55144522, desc: "Draw 2 cards" }], canBattle: true, canEnd: true, canShuffle: false,
    }} />);
    for (const s of ["Normal Summon", "Set monster", "Activate", "Battle Phase", "End Turn", "/img/small/89631139.jpg"]) expect(html).toContain(s);
  });
});
