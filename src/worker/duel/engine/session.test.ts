// The DuelRoom-facing session: persistence across "eviction", per-seat messages, manual handoff.
import { describe, expect, it } from "vitest";
import { botResponse, seededRng } from "./bot.ts";
import { createSession, type EngineStorage } from "./session.ts";
import { TEST_DECK_A, TEST_DECK_B } from "./testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

/** Minimal in-memory stand-in for DurableObjectStorage's KV API (structured-clone semantics). */
function memoryStorage(): EngineStorage & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  const clone = <T>(v: T): T => structuredClone(v);
  const s = {
    map,
    async get(key: string | string[]) {
      if (Array.isArray(key)) return new Map(key.filter((k) => map.has(k)).map((k) => [k, clone(map.get(k))]));
      return clone(map.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === "string") { map.set(key, clone(value)); return; }
      const entries = Object.entries(key);
      if (entries.length > 128) throw new Error("put: too many keys");
      for (const [k, v] of entries) map.set(k, clone(v));
    },
    async delete(key: string | string[]) {
      if (Array.isArray(key)) {
        if (key.length > 128) throw new Error("delete: too many keys");
        let n = 0; for (const k of key) if (map.delete(k)) n++; return n;
      }
      return map.delete(key);
    },
    async list(opts?: { prefix?: string }) {
      const keys = [...map.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix)).sort();
      return new Map(keys.map((k) => [k, clone(map.get(k))]));
    },
  };
  return s as unknown as EngineStorage & { map: Map<string, unknown> };
}

describe.skipIf(!engineDataAvailable)("engine session (DuelRoom API)", () => {
  it("persists every response and restores after eviction", async () => {
    const storage = memoryStorage();
    const deps = { storage, core: nodeCore, data: () => nodeData().data };
    const room1 = createSession(deps);
    let up = await room1.start({ decks: [TEST_DECK_A, TEST_DECK_B], names: ["Ann", "Bob"], first: 1 });
    expect(up.prompt?.player).toBe(1);
    expect(room1.promptFor(1)).not.toBeNull();
    expect(room1.promptFor(0)).toBeNull();

    // each seat gets its events; only the prompted seat gets the prompt
    const m0 = room1.messagesFor(0, up), m1 = room1.messagesFor(1, up);
    expect(m0.map((m) => m.t)).toEqual(["engineEvents"]);
    expect(m1.map((m) => m.t)).toEqual(["engineEvents", "prompt"]);

    const rng = seededRng(3);
    for (let i = 0; i < 80 && up.prompt; i++) up = await room1.respond(up.prompt.player, botResponse(up.prompt, rng));
    const before = room1.toBoardState(null);
    const responses = [...storage.map.keys()].filter((k) => k.startsWith("engine:r:")).length;
    expect(responses).toBeGreaterThan(80);

    // "eviction": a brand-new session object over the same storage
    const room2 = createSession(deps);
    expect(await room2.load()).toBe(true);
    expect(room2.toBoardState(null)).toEqual(before);
    expect(room2.status).toEqual(room1.status);

    // masked state: the other player's hand is hidden
    const seen = room2.toBoardState(0);
    expect(seen.players[1].hand.every((c) => c.code === 0)).toBe(true);

    // manual-mode handoff returns the full board and clears engine storage
    const board = await room2.stop();
    expect(board).toEqual(before);
    expect([...storage.map.keys()].some((k) => k.startsWith("engine:"))).toBe(false);
    expect(await createSession(deps).load()).toBe(false);
  });

  it("rejects out-of-turn answers with BadResponse", async () => {
    const deps = { storage: memoryStorage(), core: nodeCore, data: () => nodeData().data };
    const room = createSession(deps);
    const up = await room.start({ decks: [TEST_DECK_A, TEST_DECK_B], first: 0 });
    await expect(room.respond(1, botResponse(up.prompt!, seededRng(1)))).rejects.toThrow(/not your choice/);
  });
});
