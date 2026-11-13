// Synchro and Xyz Summons through the rules engine, with the built-in starter decks.
// A scripted player summons the monsters it needs (one Normal Summon per turn), then Special Summons
// the Synchro / Xyz monster from the Extra Deck; the opponent just passes. Then it checks the board:
// the Extra Deck monster is on the field, its materials went where the rules say (Synchro: GY, Xyz:
// attached underneath), and the levels add up. Also plays bot-vs-bot duels with every starter deck.
import { describe, expect, it } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EnginePrompt, EngineResponse } from "../../../shared/enginePrompts.ts";
import { STARTER_DECKS } from "../../../shared/starterDecks.ts";
import { botResponse, seededRng, type Rng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { EngineDuel, type DuelSetup } from "./EngineDuel.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const deckOf = (id: string) => {
  const d = STARTER_DECKS.find((x) => x.id === `starter:${id}`)!;
  return { main: d.main, extra: d.extra };
};

// levels of the monsters these tests use
const LEVEL: Record<number, number> = {
  63977008: 3, 68505803: 3,                          // Junk Synchron, Genex Controller (Tuners)
  9365703: 2,                                        // Speed Warrior
  69247929: 4, 91152256: 4, 69140098: 4, 43096270: 4, 39256679: 4, 2460565: 3, 15025844: 4,   // Marauding Captain is Lv3
};
const TUNERS = new Set([63977008, 68505803]);
const SYNCHROS: Record<number, number> = { 60800381: 5, 73580471: 7, 25862681: 7, 82044279: 7 };   // code -> level
const XYZ = new Set([84013237, 71594310, 581014, 46772449, 95169481]);                               // all Rank 4

const setup = (seed: number, a: string, b: string): DuelSetup => ({
  seed: [String(seed), String(seed * 7 + 1), String(seed * 13 + 2), String(seed * 31 + 3)],
  decks: [deckOf(a), deckOf(b)],
  names: ["Tester", "Passer"],
  first: 0,
});

/** Codes in `a` that aren't in `b` (multiset difference). Engine uids follow zones, so a monster
 *  that lands in a material's zone takes over its uid: compare cards by code instead. */
const minus = (a: number[], b: number[]) => {
  const left = [...b];
  return a.filter((c) => { const i = left.indexOf(c); if (i < 0) return true; left.splice(i, 1); return false; });
};
const codes = (cs: CardInstance[]) => cs.map((c) => c.code);

const field = (b: BoardState, seat: 0 | 1): CardInstance[] => [
  ...b.players[seat].monster.filter((c): c is CardInstance => !!c),
  ...b.extraMonster.filter((c): c is CardInstance => !!c && c.controller === seat),
];

/** Seat 0 follows `pickSummon` and summons any `targets` monster it can; seat 1 only passes. */
async function playUntilExtraSummon(
  duel: EngineDuel, rng: Rng, targets: Set<number>,
  pickSummon: (codes: number[], board: BoardState) => number,
  prefer: number[] = [],
) {
  let summonedFromExtra: number | null = null;
  let before: BoardState | null = null;
  for (let step = 0; step < 3000 && !duel.finished; step++) {
    const p = duel.prompt as EnginePrompt;
    let r: EngineResponse;
    if (p.kind === "idle" && p.player === 0) {
      const board = duel.toBoardState(null);
      // the preferred Extra Deck monster if it's summonable, else any target
      const options = p.specialSummons.map((c, i) => ({ c, i })).filter(({ c }) => c.location === "extra" && targets.has(c.code));
      const rank = (code: number) => { const k = prefer.indexOf(code); return k < 0 ? 99 : k; };
      options.sort((x, y) => rank(x.c.code) - rank(y.c.code));
      const sp: number = summonedFromExtra === null && options.length ? options[0].i : -1;
      if (sp >= 0) {
        summonedFromExtra = p.specialSummons[sp].code;
        before = board;
        r = { promptId: p.id, kind: "idle", action: "specialSummon", index: sp };
      } else if (summonedFromExtra !== null) {
        return { code: summonedFromExtra, before: before!, after: board, turn: board.turn };
      } else {
        const pick = p.summons.length ? pickSummon(p.summons.map((c) => c.code), board) : -1;
        r = pick >= 0 ? { promptId: p.id, kind: "idle", action: "summon", index: pick } : { promptId: p.id, kind: "idle", action: "end" };
      }
    } else if (p.kind === "idle") {
      r = { promptId: p.id, kind: "idle", action: "end" };
    } else if (p.kind === "battle") {
      r = { promptId: p.id, kind: "battle", action: p.canMain2 && p.player === 0 ? "main2" : "end" };
    } else if (p.kind === "effectYesNo" || p.kind === "yesNo") {
      // decline optional effects (e.g. Black Rose Dragon would wipe the field, itself included)
      r = { promptId: p.id, kind: p.kind, yes: false };
    } else if (p.kind === "selectChain" && !p.forced) {
      r = { promptId: p.id, kind: "selectChain", index: null };   // nobody chains: keep the test about the summon
    } else if (p.kind === "selectPosition") {
      r = { promptId: p.id, kind: "selectPosition", position: p.positions.includes("atk") ? "atk" : p.positions[0] };
    } else {
      r = botResponse(p, rng);
    }
    await duel.respond(p.player, r);
    expect(duel.retries, `core rejected ${JSON.stringify(r)} for ${p.kind}`).toBe(0);
  }
  return null;
}

describe.skipIf(!engineDataAvailable)("Extra Deck summons (starter decks)", () => {
  it("Synchro Summons: a Tuner + non-Tuners whose Levels add up, materials to the GY", async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    let done = 0;
    const made = new Set<number>();
    const order = Object.keys(SYNCHROS).map(Number);
    for (const [k, seed] of [11, 12, 13, 14, 15, 16, 17, 18].entries()) {
      const duel = await EngineDuel.create(core, data, setup(seed, "synchro", "warrior"));
      // summon a Tuner if there's none on the field yet, else a Level 4 (or Speed Warrior)
      const result = await playUntilExtraSummon(duel, seededRng(seed), new Set(Object.keys(SYNCHROS).map(Number)), (codes, board) => {
        const haveTuner = field(board, 0).some((c) => TUNERS.has(c.code));
        const want = codes.findIndex((c) => (haveTuner ? !TUNERS.has(c) : TUNERS.has(c)) && LEVEL[c]);
        return want >= 0 ? want : codes.findIndex((c) => LEVEL[c]);
      }, [...order.slice(k % order.length), ...order.slice(0, k % order.length)]);
      if (!result) continue;   // this seed never drew a Tuner + a non-Tuner in time
      done++;
      const { code, before, after } = result;
      made.add(code);
      if (process.env.EXTRA_DEBUG) console.log("SYNCHRO", code, JSON.stringify({ before: field(before, 0), after: field(after, 0), gy: after.players[0].gy.map((c) => [c.uid, c.code]), emz: after.extraMonster }));
      const onField = field(after, 0).find((c) => c.code === code);
      expect(onField, "Synchro monster on the field").toBeTruthy();
      expect(after.players[0].extra.length).toBe(before.players[0].extra.length - 1);
      // the materials: cards that left the field into the GY this step
      const left = minus(codes(field(before, 0)), minus(codes(field(after, 0)), [code]));
      const gyNew = minus(codes(after.players[0].gy), codes(before.players[0].gy));
      expect(left.length).toBeGreaterThanOrEqual(2);
      expect(gyNew.sort(), "materials went to the GY").toEqual(left.sort());
      expect(left.filter((c) => TUNERS.has(c)).length, "exactly one Tuner").toBe(1);
      expect(left.reduce((s, c) => s + (LEVEL[c] ?? 0), 0), "material Levels = Synchro Level").toBe(SYNCHROS[code]);
    }
    expect(done, "at least 4 of 8 seeds reach a Synchro Summon").toBeGreaterThanOrEqual(4);
    expect(made.size, `different Synchro monsters made: ${[...made]}`).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it("Xyz Summons: two Level 4s become Xyz Materials of a Rank 4", async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    let done = 0;
    const made = new Set<number>();
    const order = [...XYZ];
    for (const [k, seed] of [21, 22, 23, 24, 25, 26].entries()) {
      const duel = await EngineDuel.create(core, data, setup(seed, "xyz", "warrior"));
      const result = await playUntilExtraSummon(duel, seededRng(seed), XYZ, (codes) => codes.findIndex((c) => LEVEL[c] === 4),
        [...order.slice(k % order.length), ...order.slice(0, k % order.length)]);
      if (!result) continue;
      done++;
      const { code, before, after } = result;
      made.add(code);
      if (process.env.EXTRA_DEBUG) console.log("XYZ", code, JSON.stringify({ before: field(before, 0), after: field(after, 0) }));
      const xyz = field(after, 0).find((c) => c.code === code);
      expect(xyz, "Xyz monster on the field").toBeTruthy();
      expect(xyz!.materials?.length, "2 Xyz Materials attached").toBe(2);
      expect(xyz!.materials!.every((m) => LEVEL[m.code] === 4)).toBe(true);
      // the materials left the field and did NOT go to the GY
      const left = minus(codes(field(before, 0)), minus(codes(field(after, 0)), [code]));
      expect(left.sort(), "the field monsters became the materials").toEqual(xyz!.materials!.map((m) => m.code).sort());
      expect(after.players[0].gy.length).toBe(before.players[0].gy.length);
      expect(after.players[0].extra.length).toBe(before.players[0].extra.length - 1);
    }
    expect(done, "at least 4 of 6 seeds reach an Xyz Summon").toBeGreaterThanOrEqual(4);
    expect(made.size, `different Xyz monsters made: ${[...made]}`).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("plays bot-vs-bot duels with every starter deck to a result", async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    const ids = STARTER_DECKS.map((d) => d.id.replace("starter:", ""));
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const duel = await EngineDuel.create(core, data, { ...setup(100 + i, a, b), names: [a, b] });
      const rng = seededRng(100 + i);
      let steps = 0;
      while (!duel.finished && steps < 4000) {
        const p = duel.prompt!;
        await duel.respond(p.player, botResponse(p, rng));
        expect(duel.retries, `${a} vs ${b}: core rejected a ${p.kind} answer`).toBe(0);
        steps++;
      }
      expect(duel.finished, `${a} vs ${b} finished in ${steps} steps`).toBe(true);
    }
  }, 300_000);
});

describe.skipIf(!engineDataAvailable)("duel log", () => {
  it("names the attacking monster (and a face-up target) instead of 'a card'", async () => {
    clearEngineCaches();
    const core = await nodeCore();
    const { data } = nodeData();
    const { describeEvent } = await import("./roomSession.ts");
    const lines: string[] = [];
    for (const seed of [301, 302]) {
      const duel = await EngineDuel.create(core, data, { ...setup(seed, "warrior", "dragon"), names: ["Alice", "Bob"] });
      const rng = seededRng(seed);
      for (let steps = 0; !duel.finished && steps < 3000; steps++) {
        const p = duel.prompt!;
        const evs = await duel.respond(p.player, botResponse(p, rng));
        // the log carries [[code]] tokens (the client shows hoverable names): expand them to check the text
        for (const ev of evs) if (ev.e === "attack") lines.push(describeEvent(ev, ["Alice", "Bob"], (c) => duel.cardName(c))!.replace(/\[\[(\d+)\]\]/g, (_m, c) => duel.cardName(Number(c)) ?? "?"));
      }
    }
    if (process.env.EXTRA_DEBUG) console.log("ATTACKLOG", JSON.stringify(lines.slice(0, 8)));
    expect(lines.length, "some attacks happened").toBeGreaterThan(3);
    for (const l of lines) {
      expect(l).toMatch(/^(Alice|Bob)'s .+ attacks (directly|a face-down monster|.+)$/);
      expect(l, l).not.toMatch(/'s a card attacks|attacks a card$|#\d+/);
    }
  }, 120_000);
});

describe.skipIf(!engineDataAvailable)("demo duels", () => {
  it("both sides' showcase play reaches a Synchro and an Xyz Summon early (demo decks, opening combos)", async () => {
    clearEngineCaches();
    const { demoDeck } = await import("../../../shared/starterDecks.ts");
    const core = await nodeCore();
    const { data } = nodeData();
    for (const first of [0, 1] as const) {
      const a = demoDeck("synchro", seededRng(5)), b = demoDeck("xyz", seededRng(6));
      const duel = await EngineDuel.create(core, data, {
        seed: ["9", "8", "7", "6"], first, names: ["You", "Bot"], stackedForTesting: true,
        decks: [{ main: a.main, extra: a.extra }, { main: b.main, extra: b.extra }],
      });
      const rng = seededRng(11);
      let synchro = false, xyz = false, doubleSummons = 0;
      for (let steps = 0; !duel.finished && steps < 600 && duel.toBoardState(null).turn <= 4; steps++) {
        const p = duel.prompt!;
        const r = botResponse(p, rng, "showcase");
        if (p.kind === "idle" && r.kind === "idle" && r.action === "activate" && p.activates[(r as { index: number }).index]?.code === 43422537) doubleSummons++;
        if (process.env.DEMO_DEBUG && p.kind === "idle") console.log(`T${duel.toBoardState(null).turn} seat${p.player}`, JSON.stringify({ s: p.summons.map((c) => c.code), a: p.activates.map((c) => c.code), set: p.spellSets.map((c) => c.code) }), "->", JSON.stringify(r));
        await duel.respond(p.player, r);
        expect(duel.retries).toBe(0);
        const f = [0, 1].flatMap((s) => field(duel.toBoardState(null), s as 0 | 1).map((c) => c.code));
        synchro ||= f.some((c) => c in SYNCHROS);
        xyz ||= f.some((c) => XYZ.has(c));
      }
      expect(doubleSummons, "each side activates Double Summon on its first turn").toBeGreaterThanOrEqual(2);
      expect(synchro, `a Synchro Summon in the first turns (first player: ${first})`).toBe(true);
      expect(xyz, `an Xyz Summon in the first turns (first player: ${first})`).toBe(true);
    }
  }, 120_000);
});
