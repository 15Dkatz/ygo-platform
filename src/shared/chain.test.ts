import { describe, expect, it } from "vitest";
import { applyChain } from "./chain.ts";
import type { EngineEvent } from "./enginePrompts.ts";

const card = (code: number) => ({ code, controller: 0 as const, location: "monster" as const, sequence: 0 });

describe("open chain (kept by the server for pages loaded mid-chain)", () => {
  it("adds links in order, marks the resolving one, clears at the end", () => {
    let c = applyChain([], [{ e: "chain", link: 1, card: card(1), desc: "a" }, { e: "chain", link: 2, card: card(2), desc: "b", from: 9 }] as EngineEvent[]);
    expect(c.map((l) => l.link)).toEqual([1, 2]);
    expect(c[1].from).toBe(9);
    c = applyChain(c, [{ e: "chainSolving", link: 2 }] as EngineEvent[]);
    expect(c.find((l) => l.resolving)?.link).toBe(2);
    c = applyChain(c, [{ e: "chainSolved", link: 2 }] as EngineEvent[]);
    expect(c.map((l) => l.link)).toEqual([1]);
    expect(applyChain(c, [{ e: "chainEnd" }] as EngineEvent[])).toEqual([]);
  });
  it("a new turn never keeps a stale chain", () => {
    expect(applyChain([{ link: 1, card: card(1), desc: "" }], [{ e: "turn", player: 1, turn: 2 }] as EngineEvent[])).toEqual([]);
  });
});
