import { describe, expect, it } from "vitest";
import { shouldAutoPass } from "./autoPass.ts";
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
