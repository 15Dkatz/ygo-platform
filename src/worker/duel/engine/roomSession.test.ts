// Phase 3's engineHook contract: start / respond / snapshot / restore / exportBoard / finished.
import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";
import { botResponse, seededRng } from "./bot.ts";
import { restoreRoomSession, startRoomSession, type RoomEngineUpdate } from "./roomSession.ts";
import { TEST_DECK_A, TEST_DECK_B } from "./testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const deps = { core: nodeCore, data: () => nodeData().data };
const open = (u: RoomEngineUpdate): EnginePrompt => u.prompts![0].prompt;

describe.skipIf(!engineDataAvailable)("room engine session (phase 3 hook contract)", () => {
  it("plays, snapshots to JSON, restores and finishes with a result", async () => {
    const opts = { names: ["Ann", "Bob"] as [string, string], decks: [TEST_DECK_A, TEST_DECK_B] as [typeof TEST_DECK_A, typeof TEST_DECK_B], first: 0 as const, seed: new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]) };
    const s1 = startRoomSession(deps, opts);
    let u = await s1.start();
    expect(u.board?.players[0].hand.length).toBe(5);
    expect(u.prompts).toHaveLength(1);
    const rng = seededRng(11);
    const log: string[] = [];
    for (let i = 0; i < 40; i++) { const p = open(u); u = await s1.respond(p.player, botResponse(p, rng)); log.push(...(u.log ?? [])); }

    const snap = JSON.parse(JSON.stringify(s1.snapshot()));   // what DuelRoom stores
    const s2 = restoreRoomSession(deps, snap)!;
    const u2 = await s2.start();
    expect(u2.board).toEqual(s1.exportBoard());
    expect(open(u2)).toEqual(open(u));

    while (!u.finished) { const p = open(u); u = await s2.respond(p.player, botResponse(p, rng)); log.push(...(u.log ?? [])); }
    console.log(`room session: ${u.finished.reason}, winner ${u.finished.winner}; sample log:\n  ${log.slice(0, 12).join("\n  ")}`);
    expect(u.prompts).toEqual([]);
    expect(log.some((l) => /^Turn \d+: (Ann|Bob)$/.test(l))).toBe(true);
    expect(log.join("\n")).not.toMatch(/drew .*Blue-Eyes/);   // draws stay private in the public log
    expect(restoreRoomSession(deps, { nope: true })).toBeNull();
  });
});
