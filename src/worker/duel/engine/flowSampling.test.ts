// Opt-in: sample many bot-vs-bot duels and count the decisions put to one player, to see where a human's
// clicks would go and how many our auto-rules already answer.
//
//   SAMPLE_DUELS=40 npx vitest run src/worker/duel/engine/flowSampling.test.ts
//
// Writes data/flow-sample.json and prints a summary.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoAnswer } from "../../../shared/autoPass.ts";
import type { EngineEvent, EnginePrompt } from "../../../shared/enginePrompts.ts";
import { STARTER_DECKS } from "../../../shared/starterDecks.ts";
import { botResponse, seededRng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { EngineDuel } from "./EngineDuel.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const N = Number(process.env.SAMPLE_DUELS ?? 0);

/** Rough clicks a human spends on a prompt with today's UI (hover buttons, dock). */
function clicksFor(p: EnginePrompt, answerPicks = 1): number {
  switch (p.kind) {
    case "idle": case "battle": return 1;            // hover button on the card (or a phase button)
    case "selectPlace": return p.count;
    case "selectCard": case "selectTribute": return answerPicks + (p.min === p.max && p.max === answerPicks ? 0 : 1);
    case "selectUnselect": return 1;
    case "selectSum": return answerPicks + 1;
    default: return 1;
  }
}

describe.skipIf(!N || !engineDataAvailable)("flow sampling (bot duels)", () => {
  it(`samples ${N} duels`, async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    const decks = STARTER_DECKS;
    const byKind = new Map<string, { n: number; auto: number; clicks: number }>();
    const zonePicks = { total: 0, ownOnly: 0 };
    let turnsSeen = 0, duels = 0, myPrompts = 0, autoAnswered = 0, clicks = 0;
    const chainWhy = { offered: 0, autoPassed: 0, afterOpponent: 0, monsterEffect: 0 };

    for (let i = 0; i < N; i++) {
      const a = decks[i % decks.length], b = decks[(i * 3 + 1) % decks.length];
      const duel = await EngineDuel.create(core, data, {
        seed: [String(i + 1), String(i * 7 + 2), String(i * 13 + 3), String(i * 31 + 4)], first: (i % 2) as 0 | 1, names: ["Me", "Bot"],
        decks: [{ main: a.main, extra: a.extra }, { main: b.main, extra: b.extra }],
      });
      const rng = seededRng(1000 + i);
      let since: EngineEvent[] = [];
      let seen = new Set<number>(), last: Set<number> | null = null;
      const turns = new Set<number>();
      for (let step = 0; step < 3000 && !duel.finished; step++) {
        const p = duel.prompt!;
        if (p.player === 0) {
          myPrompts++;
          turns.add(duel.toBoardState(null).turn);
          if (p.kind === "selectChain") { if (last) seen = last; last = new Set(p.cards.map((c) => c.code)); }
          const auto = autoAnswer(p, 0, since, "smart", () => true, seen);
          const k = byKind.get(p.kind) ?? { n: 0, auto: 0, clicks: 0 };
          k.n++;
          if (p.kind === "selectPlace") {
            zonePicks.total++;
            if (!p.disabling && p.places.every((x) => x.controller === 0)) zonePicks.ownOnly++;
          }
          if (p.kind === "selectChain" && !p.forced) {
            chainWhy.offered++;
            if (auto) chainWhy.autoPassed++;
            else if (since.some((e) => (e.e === "chain" || e.e === "summon") && (e.e === "chain" ? e.card.controller : e.card.controller) === 1 || (e.e === "attack" && e.attacker.controller === 1))) chainWhy.afterOpponent++;
            else chainWhy.monsterEffect++;
          }
          if (auto) { k.auto++; autoAnswered++; }
          else { const c = clicksFor(p); k.clicks += c; clicks += c; }
          byKind.set(p.kind, k);
        }
        const r = botResponse(p, rng);
        const evs = await duel.respond(p.player, r);
        since = p.player === 0 ? [...evs] : [...since, ...evs];
      }
      duels++;
      turnsSeen += turns.size;
    }

    const kinds = [...byKind.entries()].sort((x, y) => y[1].n - x[1].n)
      .map(([kind, v]) => ({ kind, prompts: v.n, perTurn: +(v.n / turnsSeen).toFixed(2), autoAnswered: v.auto, humanClicks: v.clicks, clickShare: `${Math.round((100 * v.clicks) / Math.max(1, clicks))}%` }));
    const report = {
      duels, myTurns: turnsSeen, myPrompts, autoAnswered, humanClicks: clicks,
      clicksPerTurn: +(clicks / turnsSeen).toFixed(2), promptsPerTurn: +(myPrompts / turnsSeen).toFixed(2),
      zonePicks: { ...zonePicks, ownOnlyShare: `${Math.round((100 * zonePicks.ownOnly) / Math.max(1, zonePicks.total))}%` },
      chainChances: chainWhy, kinds,
    };
    mkdirSync("data", { recursive: true });
    writeFileSync("data/flow-sample.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    expect(duels).toBe(N);
  }, 600_000);
});
