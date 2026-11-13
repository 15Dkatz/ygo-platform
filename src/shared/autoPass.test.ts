import { describe, expect, it } from "vitest";
import { autoAnswer, shouldAutoPass } from "./autoPass.ts";
import type { EngineEvent, EnginePrompt } from "./enginePrompts.ts";

const chain = (cards: { location: string; code?: number; controller?: 0 | 1 }[], forced = false) =>
  ({ id: 1, player: 0, kind: "selectChain", forced, cards: cards.map((c, i) => ({ code: c.code ?? 100 + i, controller: c.controller ?? 0, location: c.location, sequence: i, desc: "" })) }) as unknown as EnginePrompt;
const setTrap = [{ location: "spelltrap" }];
const oppSummon: EngineEvent[] = [{ e: "summon", how: "normal", card: { code: 5, controller: 1, location: "monster", sequence: 0 } }];
const mySummon: EngineEvent[] = [{ e: "summon", how: "normal", card: { code: 5, controller: 0, location: "monster", sequence: 0 } }];
const oppChain: EngineEvent[] = [{ e: "chain", link: 1, card: { code: 6, controller: 1, location: "spelltrap", sequence: 0 }, desc: "" }];
const oppAttack: EngineEvent[] = [{ e: "attack", attacker: { code: 7, controller: 1, location: "monster", sequence: 0 }, target: null }];

describe("auto-pass chains", () => {
  it("smart: passes when only a set trap could respond and the opponent did nothing", () => {
    expect(shouldAutoPass(chain(setTrap), 0, [], "smart")).toBe(true);
    expect(shouldAutoPass(chain(setTrap), 0, mySummon, "smart"), "my own summon").toBe(true);
  });
  it("smart: asks when the opponent summoned, activated something or attacked", () => {
    expect(shouldAutoPass(chain(setTrap), 0, oppSummon, "smart")).toBe(false);
    expect(shouldAutoPass(chain(setTrap), 0, oppChain, "smart")).toBe(false);
    expect(shouldAutoPass(chain(setTrap), 0, oppAttack, "smart")).toBe(false);
  });
  it("always asks for monster effects (triggers, hand traps) and forced choices", () => {
    expect(shouldAutoPass(chain([{ location: "monster" }]), 0, [], "never")).toBe(false);
    expect(shouldAutoPass(chain([{ location: "gy" }]), 0, [], "never")).toBe(false);
    expect(shouldAutoPass(chain([{ location: "hand", code: 14558127 }]), 0, [], "never", (c) => c === 14558127), "hand trap").toBe(false);
    expect(shouldAutoPass(chain(setTrap, true), 0, [], "never"), "forced").toBe(false);
  });
  it("never: passes set spells/traps and Quick-Plays in hand even after the opponent acted", () => {
    expect(shouldAutoPass(chain(setTrap), 0, oppAttack, "never")).toBe(true);
    expect(shouldAutoPass(chain([{ location: "hand", code: 5 }]), 0, oppChain, "never", () => false)).toBe(true);
  });
  it("ask: never auto-passes; other players' prompts are left alone", () => {
    expect(shouldAutoPass(chain(setTrap), 0, [], "ask")).toBe(false);
    expect(shouldAutoPass(chain(setTrap), 1, [], "smart")).toBe(false);
  });
});

describe("auto-chaining", () => {
  it("activates a mandatory effect with a single option by itself", () => {
    expect(autoAnswer(chain([{ location: "monster" }], true), 0, [], "smart")).toEqual({ kind: "selectChain", index: 0 });
  });
  it("still asks for a mandatory choice between several effects", () => {
    expect(autoAnswer(chain([{ location: "monster" }, { location: "gy" }], true), 0, [], "smart")).toBeNull();
  });
  it("orders your simultaneous effects by default", () => {
    const sort = { id: 2, player: 0, kind: "sort", chain: true, cards: [] } as unknown as EnginePrompt;
    expect(autoAnswer(sort, 0, [], "smart")).toEqual({ kind: "sort", order: null });
  });
  it("marks an auto-pass, and never answers in 'ask' mode", () => {
    expect(autoAnswer(chain(setTrap), 0, [], "smart")).toEqual({ kind: "selectChain", index: null, passed: true });
    expect(autoAnswer(chain([{ location: "monster" }], true), 0, [], "ask")).toBeNull();
  });
});

describe("auto-pass: quick effects repeating at phase changes", () => {
  const utopia = [{ location: "monster", code: 84013237 }];
  const phaseOnly: EngineEvent[] = [{ e: "phase", phase: "standby" }, { e: "draw", player: 1, codes: [0] }];
  it("passes a monster quick effect offered again at a bare phase change", () => {
    expect(shouldAutoPass(chain(utopia), 0, phaseOnly, "smart", () => true, new Set([84013237]))).toBe(true);
  });
  it("asks the first time a monster effect is offered (it may be a trigger)", () => {
    expect(shouldAutoPass(chain(utopia), 0, phaseOnly, "smart", () => true, new Set())).toBe(false);
  });
  it("asks again once something happens", () => {
    const summoned: EngineEvent[] = [{ e: "summon", how: "normal", card: { code: 5, controller: 0, location: "monster", sequence: 1 } }];
    expect(shouldAutoPass(chain(utopia), 0, summoned, "smart", () => true, new Set([84013237]))).toBe(false);
  });
  it("never passes in 'ask' mode", () => {
    expect(shouldAutoPass(chain(utopia), 0, phaseOnly, "ask", () => true, new Set([84013237]))).toBe(false);
  });
});
