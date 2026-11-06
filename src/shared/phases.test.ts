import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "./enginePrompts.ts";
import { enginePhaseControls, enginePhaseResponse, manualPhaseBlock, manualPhaseControls } from "./phases.ts";

const turn = (turn: number, phase: "draw" | "standby" | "main1" | "battle" | "main2" | "end", turnPlayer: 0 | 1 = 0) => ({ turn, phase, turnPlayer });

describe("manual phase rules", () => {
  it("only the turn player moves, forward only", () => {
    expect(manualPhaseBlock(turn(2, "main1"), 1, "battle")).toMatch(/opponent/);
    expect(manualPhaseBlock(turn(2, "main1"), null, "battle")).toMatch(/Spectators/);
    expect(manualPhaseBlock(turn(2, "battle"), 0, "main1")).toMatch(/forward/);
    expect(manualPhaseBlock(turn(2, "main1"), 0, "main1")).toMatch(/already/);
    expect(manualPhaseBlock(turn(2, "main1"), 0, "battle")).toBeNull();
    expect(manualPhaseBlock(turn(2, "main1"), 0, "end")).toBeNull();
  });
  it("no Battle Phase on turn 1; Main Phase 2 only after battle", () => {
    expect(manualPhaseBlock(turn(1, "main1"), 0, "battle")).toMatch(/first turn/);
    expect(manualPhaseBlock(turn(2, "main1"), 0, "main2")).toMatch(/after the Battle Phase/);
    expect(manualPhaseBlock(turn(2, "battle"), 0, "main2")).toBeNull();
  });
  it("next phase skips what isn't allowed", () => {
    expect(manualPhaseControls(turn(1, "main1"), 0).next).toBe("end");     // no battle on turn 1
    expect(manualPhaseControls(turn(2, "main1"), 0).next).toBe("battle");
    expect(manualPhaseControls(turn(2, "battle"), 0).next).toBe("main2");
    expect(manualPhaseControls(turn(2, "main1"), 1).next).toBeNull();
    expect(manualPhaseControls(turn(2, "main1"), 1).endTurn.enabled).toBe(false);
  });
});

describe("rules-enforced phase controls", () => {
  const idle = (canBattle: boolean, canEnd: boolean) =>
    ({ kind: "idle", id: 1, player: 0, summons: [], specialSummons: [], repositions: [], monsterSets: [], spellSets: [], activates: [], canBattle, canEnd, canShuffle: false } as unknown as EnginePrompt);
  const battle = (canMain2: boolean, canEnd: boolean) =>
    ({ kind: "battle", id: 2, player: 0, attacks: [], activates: [], canMain2, canEnd } as unknown as EnginePrompt);

  it("follows exactly what the engine offers", () => {
    expect(enginePhaseResponse(idle(true, true), "battle")).toEqual({ kind: "idle", action: "battle" });
    expect(enginePhaseResponse(idle(false, true), "battle")).toBeNull();
    expect(enginePhaseResponse(idle(false, true), "endTurn")).toEqual({ kind: "idle", action: "end" });
    expect(enginePhaseResponse(battle(true, false), "main2")).toEqual({ kind: "battle", action: "main2" });
    expect(enginePhaseResponse(battle(false, false), "endTurn")).toBeNull();   // forced attack
  });
  it("disables everything (with a reason) when it isn't your decision", () => {
    const c = enginePhaseControls(turn(2, "main1"), 0, null, "Bob");
    expect(c.phases.every((p) => !p.enabled)).toBe(true);
    expect(c.endTurn.hint).toBe("Waiting for Bob.");
    const sel = enginePhaseControls(turn(2, "main1"), 0, { kind: "selectCard", id: 3, player: 0, min: 1, max: 1, canCancel: false, cards: [] } as unknown as EnginePrompt, "Bob");
    expect(sel.endTurn.hint).toMatch(/Finish the current choice/);
  });
});
