import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "./enginePrompts.ts";
import { nothingLeftToDo } from "./turnFlow.ts";

const card = { code: 1, controller: 0, location: "hand", sequence: 0 };
const idle = (o: Partial<Record<string, unknown[]>> = {}) => ({ id: 1, player: 0, kind: "idle", summons: [], specialSummons: [], repositions: [], monsterSets: [], spellSets: [], activates: [], canBattle: true, canEnd: true, canShuffle: false, ...o }) as unknown as EnginePrompt;
const battle = (o: Partial<Record<string, unknown[]>> = {}) => ({ id: 1, player: 0, kind: "battle", attacks: [], activates: [], canMain2: true, canEnd: true, ...o }) as unknown as EnginePrompt;

describe("nothing left to do", () => {
  it("is true in a Main Phase with no plays, and in a Battle Phase with no attacks or effects", () => {
    expect(nothingLeftToDo(idle())).toBe(true);
    expect(nothingLeftToDo(battle())).toBe(true);
  });
  it("is false while anything can be played", () => {
    for (const k of ["summons", "specialSummons", "activates", "spellSets", "monsterSets", "repositions"]) expect(nothingLeftToDo(idle({ [k]: [card] })), k).toBe(false);
    expect(nothingLeftToDo(battle({ attacks: [{ ...card, direct: true }] }))).toBe(false);
  });
  it("is false for other prompts", () => {
    expect(nothingLeftToDo({ id: 1, player: 0, kind: "yesNo", desc: "" } as unknown as EnginePrompt)).toBe(false);
    expect(nothingLeftToDo(null)).toBe(false);
  });
});
