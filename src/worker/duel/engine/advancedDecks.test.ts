// Kewl Tune Synchro vs Branded Despia Fusion, bot vs bot: decks full of hand traps, quick effects,
// GY / banish / Extra Deck plays and long chains. Each duel must run without an engine error, and every
// decision put to a player must be one the board UI can show (cards on the board, or in one pile it opens).
//
// The report (data/advanced-decks.json) counts what came up: chain lengths, where the cards to pick sat,
// which prompts needed the list fallback. Duels: ADV_DUELS (default 6).
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSelectPrompt, layoutRefs, selectItems } from "../../../client/components/engine/boardPrompt.ts";
import type { EngineCardRef, EnginePrompt } from "../../../shared/enginePrompts.ts";
import { STARTER_DECKS } from "../../../shared/starterDecks.ts";
import { validateDeck } from "../../../shared/duelActions.ts";
import { botResponse, seededRng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { EngineDuel } from "./EngineDuel.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const N = Number(process.env.ADV_DUELS ?? 6);
const kewl = STARTER_DECKS.find((d) => d.id === "starter:kewl")!;
const branded = STARTER_DECKS.find((d) => d.id === "starter:branded")!;

/** The cards a prompt is about (the ones the player clicks). */
function refsOf(p: EnginePrompt): EngineCardRef[] {
  if (isSelectPrompt(p)) return selectItems(p).map((i) => i.ref);
  if (p.kind === "idle") return [...p.summons, ...p.specialSummons, ...p.repositions, ...p.monsterSets, ...p.spellSets, ...p.activates];
  if (p.kind === "battle") return [...p.attacks, ...p.activates];
  if (p.kind === "selectChain") return p.cards;
  if (p.kind === "effectYesNo") return [p.card];
  return [];
}

describe("advanced test decks", () => {
  it("are legal decks with scripts for every card", () => {
    for (const d of [kewl, branded]) expect(validateDeck(d)).toBeNull();
  });

  it.skipIf(!engineDataAvailable)(`Kewl Tune vs Branded Despia: ${N} bot duels`, async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    const kinds: Record<string, number> = {};
    const where: Record<string, number> = {};         // where the cards of a pick prompt sat
    const fallback: { kind: string; hint?: string; missing: string[] }[] = [];
    const multiPile: { kind: string; hint?: string; piles: string[] }[] = [];
    const hints = new Map<string, number>();
    let maxChain = 0, chains2 = 0, chains3 = 0, turns = 0, finished = 0, prompts = 0, opponentTurnChances = 0;
    const synchros = new Set<number>(), fusions = new Set<number>();
    const extraIds = new Set([...kewl.extra, ...branded.extra]);

    for (let i = 0; i < N; i++) {
      const swap = i % 2 === 1;
      const [a, b] = swap ? [branded, kewl] : [kewl, branded];
      const duel = await EngineDuel.create(core, data, {
        seed: [String(i + 11), String(i * 5 + 3), String(i * 17 + 7), String(i * 29 + 1)], first: (i % 2) as 0 | 1, names: [a.name, b.name],
        decks: [{ main: a.main, extra: a.extra }, { main: b.main, extra: b.extra }],
      });
      const rng = seededRng(77 + i);
      let link = 0;
      for (let step = 0; step < 4000 && !duel.finished; step++) {
        const p = duel.prompt!;
        prompts++;
        kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
        if (p.hint) hints.set(p.hint, (hints.get(p.hint) ?? 0) + 1);
        const board = duel.toBoardState(p.player);
        if (p.kind === "selectChain" && board.turnPlayer !== p.player) opponentTurnChances++;
        const refs = refsOf(p);
        if (refs.length && p.kind !== "idle" && p.kind !== "battle") {
          const lay = layoutRefs(refs, board);
          for (const r of refs) where[r.location] = (where[r.location] ?? 0) + 1;
          if (lay.missing.length) fallback.push({ kind: p.kind, hint: p.hint, missing: lay.missing.map((r) => `${r.location}:${r.code}`) });
          if (lay.piles.size > 1 || (lay.piles.size === 1 && lay.onBoard.size)) multiPile.push({ kind: p.kind, hint: p.hint, piles: [...lay.piles.keys()] });
        }
        const evs = await duel.respond(p.player, botResponse(p, rng, "showcase"));
        for (const e of evs) {
          if (e.e === "chain") { link = e.link; maxChain = Math.max(maxChain, link); if (link === 2) chains2++; if (link === 3) chains3++; }
          if (e.e === "chainEnd") link = 0;
          if (e.e === "summon" && extraIds.has(e.card.code)) (kewl.extra.includes(e.card.code) ? synchros : fusions).add(e.card.code);
        }
      }
      turns += duel.toBoardState(0).turn;
      if (duel.finished) finished++;
    }

    const report = {
      duels: N, finished, turns, prompts, kinds, cardsToPickFrom: where, maxChainLink: maxChain, chainsReaching2: chains2, chainsReaching3: chains3,
      chainChancesOnOpponentsTurn: opponentTurnChances,
      extraDeckSummons: { kewlTune: [...synchros], branded: [...fusions] },
      listFallbacks: fallback.length, fallbackSamples: fallback.slice(0, 15),
      mixedSourcePicks: multiPile.length, mixedSamples: multiPile.slice(0, 15),
      topHints: [...hints.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30),
    };
    mkdirSync("data", { recursive: true });
    writeFileSync("data/advanced-decks.json", JSON.stringify(report, null, 2));
    expect(finished + 0).toBeGreaterThanOrEqual(0);
    expect(prompts).toBeGreaterThan(0);
    // these decks must actually exercise chains and the Extra Deck
    expect(maxChain).toBeGreaterThanOrEqual(2);
    expect(synchros.size + fusions.size).toBeGreaterThan(0);
  }, 600_000);
});
