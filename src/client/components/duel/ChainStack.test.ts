import { describe, expect, it } from "vitest";
import { applyChainEvents } from "./ChainStack.tsx";
import type { EngineEvent } from "../../../shared/enginePrompts.ts";

const ref = (code: number, controller: 0 | 1) => ({ code, controller, location: "spelltrap" as const, sequence: 0 });
describe("chain display", () => {
  it("builds the chain, marks the resolving link, drops resolved links, clears at the end", () => {
    let c = applyChainEvents([], [{ e: "chain", link: 1, card: ref(10, 1), desc: "Revive" }] as EngineEvent[]);
    c = applyChainEvents(c, [{ e: "chain", link: 2, card: ref(20, 0), desc: "Negate" }] as EngineEvent[]);
    expect(c.map((l) => l.code)).toEqual([10, 20]);
    c = applyChainEvents(c, [{ e: "chainSolving", link: 2 }] as EngineEvent[]);
    expect(c.find((l) => l.link === 2)?.resolving).toBe(true);
    c = applyChainEvents(c, [{ e: "chainSolved", link: 2 }] as EngineEvent[]);
    expect(c.map((l) => l.link)).toEqual([1]);
    c = applyChainEvents(c, [{ e: "chainEnd" }] as EngineEvent[]);
    expect(c).toEqual([]);
  });
});
