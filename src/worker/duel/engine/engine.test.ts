// End-to-end: two bots play full duels through the engine adapter (no browser, no Worker).
import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";
import { botResponse, seededRng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { EngineDuel, eventsFor, type DuelSetup } from "./EngineDuel.ts";
import { TEST_DECK_A, TEST_DECK_B } from "./testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const setup = (seed: number, first: 0 | 1 = 0): DuelSetup => ({
  seed: [String(seed), String(seed * 7 + 1), String(seed * 13 + 2), String(seed * 31 + 3)],
  decks: [TEST_DECK_A, TEST_DECK_B],
  names: ["Bot A", "Bot B"],
  first,
});

async function playOut(duel: EngineDuel, seed: number, maxSteps = 4000) {
  const rng = seededRng(seed);
  const kinds = new Map<string, number>();
  const eventKinds = new Map<string, number>();
  let steps = 0, retries = 0, stepMs = 0, worstMs = 0;
  let last: EnginePrompt | null = null;
  while (!duel.finished && steps < maxSteps) {
    const p = duel.prompt;
    if (!p) throw new Error("engine is idle but the duel isn't over");
    kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    const t0 = performance.now();
    const events = await duel.respond(p.player, botResponse(p, rng));
    const dt = performance.now() - t0;
    stepMs += dt; worstMs = Math.max(worstMs, dt);
    for (const ev of events) eventKinds.set(ev.e, (eventKinds.get(ev.e) ?? 0) + 1);
    retries += duel.retries;
    steps++; last = p;
  }
  return { steps, retries, kinds, eventKinds, avgMs: stepMs / Math.max(1, steps), worstMs, last };
}

describe.skipIf(!engineDataAvailable)("rules engine (ocgcore WASM)", () => {
  it("plays full bot-vs-bot duels to a result", async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const t0 = performance.now();
    const { data, source } = nodeData();
    const duel = await EngineDuel.create(core, data, setup(1));
    const createMs = performance.now() - t0;
    expect(duel.prompt).not.toBeNull();

    // opening hands: 5 cards each, deck 35 (the first player skips the first draw)
    const b0 = duel.toBoardState(null);
    expect(b0.players[0].hand.length + b0.players[1].hand.length).toBeGreaterThanOrEqual(10);
    expect(b0.players[0].deck.length + b0.players[0].hand.length).toBe(40);
    expect(b0.players[1].extra.length).toBe(2);
    // masking: player 0 can't see player 1's hand or any deck
    const v0 = duel.toBoardState(0);
    expect(v0.players[1].hand.every((c) => c.code === 0)).toBe(true);
    expect(v0.players[0].hand.every((c) => c.code !== 0)).toBe(true);
    expect(v0.players[0].deck.every((c) => c.code === 0)).toBe(true);

    const r = await playOut(duel, 42);
    const board = duel.toBoardState(null);
    console.log(
      `duel 1: ${r.steps} responses, ${duel.status.turn} turns, winner seat ${duel.status.winner}, LP ${duel.status.lp.join("/")}, ` +
      `retries ${r.retries}, rebuilds ${duel.rebuilds}, create ${createMs.toFixed(0)} ms, avg step ${r.avgMs.toFixed(2)} ms (worst ${r.worstMs.toFixed(1)}), ` +
      `scripts read ${source.scriptReads}\n  prompts: ${JSON.stringify(Object.fromEntries(r.kinds))}\n  events: ${JSON.stringify(Object.fromEntries(r.eventKinds))}`,
    );
    expect(duel.finished).toBe(true);
    expect(r.kinds.get("idle")).toBeGreaterThan(0);
    expect(r.kinds.get("battle")).toBeGreaterThan(0);
    expect(board.players.every((p) => p.deck.length + p.hand.length + p.gy.length + p.banished.length +
      p.monster.filter(Boolean).length + p.spelltrap.filter(Boolean).length + (p.field ? 1 : 0) >= 30)).toBe(true);
  });

  it("restores a duel mid-way by replaying the response log (hibernation)", async () => {
    const core = await nodeCore();
    const { data } = nodeData();
    const a = await EngineDuel.create(core, data, setup(7, 1));
    const rng = seededRng(7);
    for (let i = 0; i < 60 && !a.finished; i++) await a.respond(a.prompt!.player, botResponse(a.prompt!, rng));
    const saved = JSON.parse(JSON.stringify(a.saved));          // what the DO stores
    const t0 = performance.now();
    const b = await EngineDuel.restore(core, data, saved);
    const replayMs = performance.now() - t0;
    console.log(`restore: replayed ${saved.responses.length} responses in ${replayMs.toFixed(0)} ms`);
    expect(b.toBoardState(null)).toEqual(a.toBoardState(null));
    expect(b.status).toEqual(a.status);
    expect(b.prompt).toEqual(a.prompt);
    // and both continue identically
    const rngA = seededRng(99), rngB = seededRng(99);
    for (let i = 0; i < 30 && !a.finished; i++) {
      await a.respond(a.prompt!.player, botResponse(a.prompt!, rngA));
      await b.respond(b.prompt!.player, botResponse(b.prompt!, rngB));
    }
    expect(b.toBoardState(null)).toEqual(a.toBoardState(null));
    a.destroy(); b.destroy();
  });

  it("rejects invalid responses without changing state", async () => {
    const core = await nodeCore();
    const { data } = nodeData();
    const d = await EngineDuel.create(core, data, setup(3));
    const p = d.prompt!;
    await expect(d.respond((1 - p.player) as 0 | 1, botResponse(p, seededRng(1)))).rejects.toThrow(/not your choice/);
    await expect(d.respond(p.player, { promptId: p.id + 5, kind: "yesNo", yes: true })).rejects.toThrow(/expired/);
    await expect(d.respond(p.player, { promptId: p.id, kind: "rps", choice: "rock" })).rejects.toThrow(/expected/);
    expect(d.saved.responses.length).toBe(0);
    d.destroy();
  });

  it("masks hidden information in events per viewer", async () => {
    const core = await nodeCore();
    const { data } = nodeData();
    const d = await EngineDuel.create(core, data, setup(5));
    const rng = seededRng(5);
    let sawDraw = false;
    for (let i = 0; i < 80 && !d.finished; i++) {
      const evs = await d.respond(d.prompt!.player, botResponse(d.prompt!, rng));
      for (const ev of evs) if (ev.e === "draw") {
        sawDraw = true;
        const other = (1 - ev.player) as 0 | 1;
        const masked = eventsFor([ev], other)[0] as typeof ev;
        expect(masked.codes.every((c) => c === 0)).toBe(true);
        expect((eventsFor([ev], ev.player)[0] as typeof ev).codes).toEqual(ev.codes);
      }
    }
    expect(sawDraw).toBe(true);
    d.destroy();
  });

  it("runs many seeds without getting stuck", async () => {
    const core = await nodeCore();
    const results: string[] = [];
    for (let s = 10; s < 16; s++) {
      const { data } = nodeData();
      const d = await EngineDuel.create(core, data, setup(s, (s % 2) as 0 | 1));
      const r = await playOut(d, s);
      results.push(`seed ${s}: ${d.finished ? `winner ${d.status.winner}` : "unfinished"} after ${d.status.turn} turns/${r.steps} responses, retries ${r.retries}`);
      expect(d.finished).toBe(true);
      d.destroy();
    }
    console.log(results.join("\n"));
  });
});
