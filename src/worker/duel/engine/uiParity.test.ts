// UI <-> rules engine parity: play real duels, answering every decision through the UI's own logic
// (what the board highlights, the action menus, the phase buttons, the selection picker, zone mapping,
// auto-chaining), on the masked prompt + masked board each player actually gets. At every step:
//   - every legal option the engine offers is reachable in the UI (a card action on a card that's shown)
//   - the phase buttons / "nothing left to play" match what the engine allows
//   - every zone the engine offers maps to its own spot on the board
//   - every answer the UI builds is accepted by the engine (no retries)
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionsByUid, isSelectPrompt, layoutRefs, placeKeys, selectItems, selectResponse, selectStatus, type SelectPrompt } from "../../../client/components/engine/boardPrompt.ts";
import { autoAnswer } from "../../../shared/autoPass.ts";
import type { EngineCardRef, EngineEvent, EnginePrompt, EngineResponse, EngineResponseBody } from "../../../shared/enginePrompts.ts";
import { enginePhaseControls, enginePhaseResponse } from "../../../shared/phases.ts";
import { STARTER_DECKS } from "../../../shared/starterDecks.ts";
import { nothingLeftToDo } from "../../../shared/turnFlow.ts";
import { botResponse, seededRng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { EngineDuel } from "./EngineDuel.ts";
import { maskPrompt } from "./promptMask.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const deck = (id: string) => STARTER_DECKS.find((d) => d.id === `starter:${id}`)!;
const MATCHES: [string, string][] = [["kewl", "branded"], ["branded", "kewl"], ["kewl", "branded"], ["synchro", "xyz"], ["warrior", "dragon"]];

/** The cards a prompt is about. */
function refsOf(p: EnginePrompt): EngineCardRef[] {
  if (isSelectPrompt(p)) return selectItems(p).map((i) => i.ref);
  if (p.kind === "idle") return [...p.summons, ...p.specialSummons, ...p.repositions, ...p.monsterSets, ...p.spellSets, ...p.activates];
  if (p.kind === "battle") return [...p.attacks, ...p.activates];
  if (p.kind === "selectChain") return p.cards;
  if (p.kind === "effectYesNo") return [p.card];
  return [];
}
const optionCount = (p: EnginePrompt) =>
  p.kind === "idle" ? p.summons.length + p.specialSummons.length + p.repositions.length + p.monsterSets.length + p.spellSets.length + p.activates.length
  : p.kind === "battle" ? p.attacks.length + p.activates.length
  : p.kind === "selectChain" ? p.cards.length : 0;

/** The UI's way to build an answer to a selection: click items until the picker says it's ready. */
function uiSelect(p: SelectPrompt, rng: () => number): EngineResponseBody | null {
  const items = selectItems(p).filter((i) => !i.fixed);
  if (p.kind === "selectUnselect") {
    if (p.canFinish && (rng() < 0.5 || !items.length)) return { kind: "selectUnselect", index: null };
    return items.length ? { kind: "selectUnselect", index: items[Math.floor(rng() * items.length)].index } : null;
  }
  if (p.kind === "selectCounter") return null;   // counters: the bot's answer (the UI cycles counts per card)
  const picked: number[] = [];
  const order = [...items].sort(() => rng() - 0.5);
  for (const it of order) {
    if (selectStatus(p, picked).ready && rng() < 0.5) break;
    picked.push(it.index);
    if (selectStatus(p, picked).ready && (p.kind === "selectCard" ? picked.length >= p.min : true)) break;
  }
  return selectResponse(p, picked);
}

describe.skipIf(!engineDataAvailable)("UI <-> rules engine parity", () => {
  it(`agrees with the engine at every decision (${MATCHES.length} duels)`, async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    const stats = { prompts: 0, uiAnswers: 0, autoAnswers: 0, botAnswers: 0, granted: 0 };

    for (const [m, [a, b]] of MATCHES.entries()) {
      const A = deck(a), B = deck(b);
      const duel = await EngineDuel.create(core, data, {
        seed: [String(m + 5), String(m * 3 + 1), String(m * 11 + 2), String(m * 17 + 9)], first: (m % 2) as 0 | 1, names: [A.name, B.name],
        decks: [{ main: A.main, extra: A.extra }, { main: B.main, extra: B.extra }],
      });
      const rng = seededRng(500 + m);
      let since: EngineEvent[] = [];
      for (let step = 0; step < 1500 && !duel.finished; step++) {
        const raw = duel.prompt!;
        const seat = raw.player;
        const p = maskPrompt(raw, seat);
        const board = duel.toBoardState(seat);
        const where = `duel ${m} step ${step} ${p.kind}`;
        stats.prompts++;

        // the cards it's about are all somewhere the UI shows (a card, or a pile it opens)
        const refs = refsOf(p);
        if (refs.length) expect(layoutRefs(refs, board).missing, `${where}: refs not on the board`).toEqual([]);

        // every option is a card action in the UI
        if (p.kind === "idle" || p.kind === "battle" || p.kind === "selectChain") {
          const total = [...actionsByUid(p).values()].reduce((n, list) => n + list.length, 0);
          expect(total, `${where}: UI actions vs engine options`).toBe(optionCount(p));
        }
        // phase buttons and the "nothing left" pulse
        if (p.kind === "idle" || p.kind === "battle") {
          const ctl = enginePhaseControls(board, seat, p, "them");
          const btn = (ph: string) => ctl.phases.find((x) => x.phase === ph)?.enabled ?? false;
          if (p.kind === "idle") {
            expect(btn("battle"), `${where}: BP button`).toBe(p.canBattle);
            expect(!!enginePhaseResponse(p, "battle"), `${where}: BP answer`).toBe(p.canBattle);
            expect(ctl.endTurn.enabled, `${where}: End turn`).toBe(p.canEnd);
          } else {
            expect(btn("main2"), `${where}: M2 button`).toBe(p.canMain2);
          }
          expect(nothingLeftToDo(p), `${where}: nothing-left pulse`).toBe(optionCount(p) === 0);
        }
        // every label the player reads is real text (no bare engine numbers like "#1" / "Option 7")
        const unnamed = (t: string) => /^Option \d+$|#\d/.test(t);
        if (p.kind === "option") for (const o of p.options) expect(!o || unnamed(o), `${where}: unnamed option ${JSON.stringify(p.options)}`).toBe(false);
        if (p.kind === "yesNo" || p.kind === "effectYesNo") expect(unnamed(p.desc), `${where}: unnamed question "${p.desc}"`).toBe(false);
        if (p.kind === "idle" || p.kind === "battle") for (const e of p.activates) expect(unnamed(e.desc), `${where}: unnamed effect "${e.desc}"`).toBe(false);
        if (p.kind === "selectChain") for (const e of p.cards) expect(unnamed(e.desc), `${where}: unnamed chain effect "${e.desc}"`).toBe(false);
        if (p.hint) expect(unnamed(p.hint), `${where}: unnamed hint "${p.hint}"`).toBe(false);
        stats.granted += [...(p.kind === "idle" || p.kind === "battle" ? p.activates : p.kind === "selectChain" ? p.cards : [])].filter((e) => e.from).length;

        // zones: one board spot per offered place
        if (p.kind === "selectPlace") expect(placeKeys(p, board).size, `${where}: zone collisions`).toBe(p.places.length);

        // answer the UI's way where it builds the answer, else as the bot would
        let body: EngineResponseBody | null = null;
        let via: "uiAnswers" | "autoAnswers" | "botAnswers" = "botAnswers";
        const auto = autoAnswer(p, seat, since, "smart");
        if (auto) {
          const { passed: _p, ...rest } = auto as typeof auto & { passed?: boolean };
          body = rest as EngineResponseBody; via = "autoAnswers";
        } else if (p.kind === "idle" || p.kind === "battle") {
          const actions = [...actionsByUid(p).values()].flat();
          const phase = p.kind === "idle" ? (p.canBattle ? "battle" : "endTurn") : "endTurn";
          body = actions.length && rng() < 0.8 ? actions[Math.floor(rng() * actions.length)].response : enginePhaseResponse(p, phase);
          via = "uiAnswers";
        } else if (isSelectPrompt(p)) {
          body = uiSelect(p, rng);
          if (body) via = "uiAnswers";
        } else if (p.kind === "selectPlace") {
          body = { kind: "selectPlace", places: [...placeKeys(p, board).values()].slice(0, p.count) }; via = "uiAnswers";
        }
        const response = (body ? { ...body, promptId: raw.id } : botResponse(raw, rng)) as EngineResponse;
        if (!body) via = "botAnswers";
        const events = await duel.respond(seat, response);
        // respond() resets the count, then counts the engine's "try again" messages for this answer
        expect(duel.retries, `${where}: engine rejected the ${via} answer ${JSON.stringify(response).slice(0, 200)}`).toBe(0);
        stats[via]++;
        since = events;
      }
    }
    // the UI's own logic answered most decisions
    expect(stats.uiAnswers).toBeGreaterThan(stats.botAnswers);
    writeFileSync("data/ui-parity.json", JSON.stringify(stats, null, 2));
  }, 600_000);
});
