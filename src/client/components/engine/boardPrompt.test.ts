// Prompt -> board model, and animation intents from engine events / manual board diffs.
import { describe, expect, it } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineCardRef, EnginePrompt, Seat } from "../../../shared/enginePrompts.ts";
import { botResponse, seededRng } from "../../../worker/duel/engine/bot.ts";
import { EngineDuel, eventsFor } from "../../../worker/duel/engine/EngineDuel.ts";
import { TEST_DECK_A, TEST_DECK_B } from "../../../worker/duel/engine/testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "../../../worker/duel/engine/testHarness.ts";
import { engineIntents, manualIntents } from "../duel/anim/intents.ts";
import { indexBoard } from "./boardRefs.ts";
import { actionsByUid, dropChoices, layoutRefs, selectItems, selectResponse, selectStatus, type SelectPrompt } from "./boardPrompt.ts";

const ref = (location: EngineCardRef["location"], sequence: number, extra: Partial<EngineCardRef> = {}): EngineCardRef => ({ code: 100 + sequence, controller: 0, location, sequence, ...extra });
const base = { id: 7, player: 0 as Seat };
const card = (uid: string, code = 1, extra: Partial<CardInstance> = {}): CardInstance => ({ uid, code, owner: 0, faceUp: true, ...extra });
const player = () => ({ name: "", lp: 8000, deck: [] as CardInstance[], hand: [] as CardInstance[], extra: [] as CardInstance[], gy: [] as CardInstance[], banished: [] as CardInstance[],
  monster: [null, null, null, null, null] as (CardInstance | null)[], spelltrap: [null, null, null, null, null] as (CardInstance | null)[], field: null as CardInstance | null, pendulum: [null, null] as (CardInstance | null)[] });
const boardOf = (p0: ReturnType<typeof player>, p1 = player()): BoardState => ({ players: [p0, p1], extraMonster: [null, null], turn: 1, turnPlayer: 0, phase: "main1", log: [] });

describe("actions on cards", () => {
  const idle: EnginePrompt = {
    ...base, kind: "idle",
    summons: [ref("hand", 0)], specialSummons: [], monsterSets: [ref("hand", 0)], spellSets: [ref("hand", 2)],
    repositions: [ref("monster", 1, { position: "atk" }), ref("monster", 3, { position: "faceDownDef" })],
    activates: [{ ...ref("hand", 2), desc: "Destroy all monsters" }, { ...ref("spelltrap", 0), desc: "Draw 1" }, { ...ref("spelltrap", 0), desc: "Gain 500 LP" }],
    canBattle: true, canEnd: true, canShuffle: false,
  };
  it("groups an idle prompt's actions by card, with effect text only where a card has several", () => {
    const a = actionsByUid(idle);
    expect(a.get("e0-2-0")!.map((x) => x.label)).toEqual(["Normal Summon", "Set"]);
    expect(a.get("e0-2-2")!.map((x) => x.label)).toEqual(["Set", "Activate"]);
    expect(a.get("e0-8-0")!.map((x) => x.label)).toEqual(["Activate: Draw 1", "Activate: Gain 500 LP"]);
    expect(a.get("e0-4-1")![0].label).toBe("Change to Defense Position");
    expect(a.get("e0-4-3")![0].label).toBe("Flip Summon");
    expect(a.get("e0-8-0")![1].response).toEqual({ kind: "idle", action: "activate", index: 2 });
  });
  it("finds the one legal action for a drag onto a zone", () => {
    const a = actionsByUid(idle);
    expect(dropChoices(a.get("e0-2-0"), "monster").map((x) => x.label)).toEqual(["Normal Summon", "Set"]);
    expect(dropChoices(a.get("e0-2-0"), "spelltrap")).toEqual([]);
    expect(dropChoices(a.get("e0-2-2"), "spelltrap").map((x) => x.response)).toEqual([{ kind: "idle", action: "spellSet", index: 0 }, { kind: "idle", action: "activate", index: 0 }]);
  });
  it("labels chain windows and attacks", () => {
    const chain = actionsByUid({ ...base, kind: "selectChain", forced: false, cards: [{ ...ref("spelltrap", 1), desc: "Negate the attack" }] });
    expect(chain.get("e0-8-1")![0]).toEqual({ label: "Activate: Negate the attack", response: { kind: "selectChain", index: 0 } });
    const battle = actionsByUid({ ...base, kind: "battle", activates: [], attacks: [{ ...ref("monster", 2), direct: true }], canMain2: true, canEnd: true });
    expect(battle.get("e0-4-2")![0].label).toMatch(/^Attack/);
  });
});

describe("selections", () => {
  it("needs the right count before Confirm", () => {
    const p: SelectPrompt = { ...base, kind: "selectCard", min: 2, max: 2, canCancel: true, cards: [ref("gy", 0), ref("gy", 1), ref("gy", 2)] };
    expect(selectResponse(p, [1])).toBeNull();
    expect(selectResponse(p, [2, 0])).toEqual({ kind: "selectCard", indices: [0, 2] });
    expect(selectStatus(p, [1]).label).toBe("1/2");
  });
  it("counts double tributes and sums levels", () => {
    const t: SelectPrompt = { ...base, kind: "selectTribute", min: 2, max: 2, canCancel: false, cards: [{ ...ref("monster", 0), value: 2 }, { ...ref("monster", 1), value: 1 }, { ...ref("monster", 2), value: 1 }] };
    expect(selectStatus(t, [0]).ready).toBe(true);
    expect(selectStatus(t, [1]).ready).toBe(false);
    expect(selectStatus(t, [1, 2]).ready).toBe(true);
    const s: SelectPrompt = { ...base, kind: "selectSum", target: 8, exact: true, min: 0, max: 0, must: [{ ...ref("hand", 0), value: 4 }], cards: [{ ...ref("monster", 0), value: 4 }, { ...ref("monster", 1), value: 3 }] };
    expect(selectResponse(s, [1])).toBeNull();
    expect(selectResponse(s, [0])).toEqual({ kind: "selectSum", indices: [0] });
    expect(selectItems(s)[0].fixed).toBe(true);
  });
  it("counts counters and lays out off-board picks by pile", () => {
    const c: SelectPrompt = { ...base, kind: "selectCounter", counterType: 1, count: 2, cards: [{ ...ref("monster", 0), available: 3 }] };
    expect(selectResponse(c, [], [1])).toBeNull();
    expect(selectResponse(c, [], [2])).toEqual({ kind: "selectCounter", counts: [2] });
    const b = boardOf({ ...player(), hand: [card("e0-2-0")], monster: [card("e0-4-0"), null, null, null, null] });
    const l = layoutRefs([ref("hand", 0), ref("monster", 0), ref("gy", 0), ref("gy", 1), ref("deck", 5), ref("monster", 4)], b);
    expect([...l.onBoard]).toEqual(["e0-2-0", "e0-4-0"]);
    expect([...l.piles.entries()].map(([k, v]) => [k, v.length])).toEqual([["gy:0:", 2], ["deck:0:", 1]]);
    expect(l.missing).toHaveLength(1);   // a field ref with no card there: the list panel takes over
  });
});

describe("animation intents", () => {
  it("engine: a draw flies deck -> the new hand card; a summon FLIPs the card from its hand slot", () => {
    const prev = boardOf({ ...player(), hand: [card("e0-2-0"), card("e0-2-1")] });
    const next = boardOf({ ...player(), hand: [card("e0-2-0"), card("e0-2-1")], monster: [null, null, card("e0-4-2"), null, null] });
    const ints = engineIntents([
      { e: "draw", player: 0, codes: [55] },
      { e: "move", code: 9, from: ref("hand", 1), to: ref("monster", 2, { position: "atk" }) },
      { e: "summon", how: "normal", card: ref("monster", 2) },
      { e: "move", code: 0, from: ref("monster", 0, { controller: 1 }), to: ref("gy", 3, { controller: 1 }) },
      { e: "shuffle", player: 1, where: "deck" },
    ], prev, next);
    expect(ints[0]).toMatchObject({ t: "move", from: { zone: "deck:0:" }, to: { uid: "e0-2-2" }, code: 55, faceUp: true });
    expect(ints[1]).toMatchObject({ t: "move", from: { uid: "e0-2-1" }, to: { uid: "e0-4-2", zone: "monster:0:2" }, flip: true, faceUp: true });
    expect(ints[2]).toMatchObject({ t: "pulse", uid: "e0-4-2" });
    expect(ints[3]).toMatchObject({ t: "move", from: { uid: "e1-4-0" }, to: { zone: "gy:1:" }, flip: false });
    expect(ints[4]).toEqual({ t: "shuffle", zone: "deck:1:" });
  });
  it("engine: a slot that is filled then emptied in one batch uses ghosts, not the wrong element", () => {
    const b = boardOf(player());
    const ints = engineIntents([
      { e: "move", code: 9, from: ref("hand", 0), to: ref("monster", 1) },
      { e: "move", code: 9, from: ref("monster", 1), to: ref("gy", 0) },
    ], b, b);
    expect(ints[0]).toMatchObject({ flip: false });
  });
  it("manual: moves, position changes and deck shuffles by uid", () => {
    const prev = boardOf({ ...player(), deck: [card("a", 0), card("b", 0), card("c", 0)], hand: [card("h1", 5)], monster: [card("m1", 6, { position: "atk" }), null, null, null, null] });
    const next = boardOf({ ...player(), deck: [card("c", 0), card("a", 0), card("b", 0)], hand: [], monster: [card("m1", 6, { position: "def" }), card("h1", 5, { position: "atk" }), null, null, null] });
    const ints = manualIntents(prev, next);
    expect(ints).toContainEqual(expect.objectContaining({ t: "move", from: { uid: "h1", zone: "hand:0:" }, to: { uid: "h1", zone: "monster:0:1" }, flip: true }));
    expect(ints).toContainEqual({ t: "rotate", uid: "m1", from: "atk", to: "def", reveal: false });
    expect(ints).toContainEqual({ t: "shuffle", zone: "deck:0:" });
  });
});

describe.skipIf(!engineDataAvailable)("animation intents against real duels", () => {
  it("every FLIP target an engine step names is a card on the new board", async () => {
    const duel = await EngineDuel.create(await nodeCore(), nodeData().data, { seed: ["9", "8", "7", "6"], decks: [TEST_DECK_A, TEST_DECK_B], names: ["A", "B"], first: 1 });
    const rng = seededRng(17);
    let prev = duel.toBoardState(0), flips = 0;
    for (let step = 0; step < 500 && !duel.finished; step++) {
      const p = duel.prompt!;
      const events = await duel.respond(p.player, botResponse(p, rng));
      const next = duel.toBoardState(0);
      const ix = indexBoard(next);
      for (const it of engineIntents(eventsFor(events, 0), prev, next)) {
        if (it.t === "move" && it.flip) { expect(ix.has(it.to.uid!), JSON.stringify(it)).toBe(true); flips++; }
      }
      prev = next;
    }
    expect(flips).toBeGreaterThan(30);
  });
});
