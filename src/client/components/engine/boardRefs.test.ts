// EngineCardRef / EnginePlace -> board mapping: hand-made cases for every zone kind, then real
// bot duels through the engine (both turn orders) checking every ref in every prompt.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineCardRef, EnginePrompt, Seat } from "../../../shared/enginePrompts.ts";
import { botResponse, seededRng } from "../../../worker/duel/engine/bot.ts";
import { EngineDuel, type DuelSetup } from "../../../worker/duel/engine/EngineDuel.ts";
import { TEST_DECK_A, TEST_DECK_B } from "../../../worker/duel/engine/testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "../../../worker/duel/engine/testHarness.ts";
import { emzIndex, engineFirst, indexBoard, locateRef, placeZone, refUid, refZone, visibleCode, zoneKey } from "./boardRefs.ts";

const card = (uid: string, code: number, extra: Partial<CardInstance> = {}): CardInstance => ({ uid, code, owner: 0, faceUp: true, ...extra });
const emptyPlayer = () => ({
  name: "", lp: 8000, deck: [], hand: [], extra: [], gy: [], banished: [],
  monster: [null, null, null, null, null], spelltrap: [null, null, null, null, null], field: null, pendulum: [null, null],
});

describe("engine ref -> board mapping", () => {
  it("builds the toBoardState uid for every location", () => {
    const r = (location: EngineCardRef["location"], sequence: number, extra: Partial<EngineCardRef> = {}): EngineCardRef => ({ code: 1, controller: 1, location, sequence, ...extra });
    expect(refUid(r("hand", 3))).toBe("e1-2-3");
    expect(refUid(r("deck", 0))).toBe("e1-1-0");
    expect(refUid(r("monster", 2))).toBe("e1-4-2");
    expect(refUid(r("monster", 6))).toBe("e1-4-6");          // EMZ cards keep the core's sequence
    expect(refUid(r("spelltrap", 4))).toBe("e1-8-4");
    expect(refUid(r("field", 5))).toBe("e1-8-5");
    expect(refUid(r("pendulum", 0))).toBe("e1-8-0");          // Master Rule 5: P-zones are S/T 1 and 5
    expect(refUid(r("pendulum", 1))).toBe("e1-8-4");
    expect(refUid(r("pendulum", 7))).toBe("e1-8-4");
    expect(refUid(r("gy", 9))).toBe("e1-16-9");
    expect(refUid(r("banished", 0))).toBe("e1-32-0");
    expect(refUid(r("extra", 1))).toBe("e1-64-1");
    expect(refUid(r("overlay", 5, { overlay: 2 }))).toBe("e1-4-5-m2");
  });

  it("maps the shared Extra Monster Zones from both teams' numbering", () => {
    // team 0 (went first): seq 5 = left (index 0); team 1 numbers the same zones the other way round
    expect(emzIndex(0, 5, 0)).toBe(0);
    expect(emzIndex(0, 6, 0)).toBe(1);
    expect(emzIndex(1, 5, 0)).toBe(1);
    expect(emzIndex(1, 6, 0)).toBe(0);
    expect(emzIndex(1, 5, 1)).toBe(0);   // seat 1 went first -> seat 1 is team 0
    expect(emzIndex(0, 5, 1)).toBe(1);
    expect(placeZone({ controller: 1, location: "monster", sequence: 5 }, 0)).toEqual({ zone: "extraMonster", player: 1, slot: 1 });
    expect(placeZone({ controller: 0, location: "monster", sequence: 3 }, 0)).toEqual({ zone: "monster", player: 0, slot: 3 });
    expect(placeZone({ controller: 0, location: "pendulum", sequence: 1 }, 0)).toEqual({ zone: "spelltrap", player: 0, slot: 4 });
    expect(placeZone({ controller: 0, location: "field", sequence: 5 }, 0)).toEqual({ zone: "field", player: 0 });
    expect(refZone({ code: 1, controller: 0, location: "overlay", sequence: 6, overlay: 0 }, 1)).toEqual({ zone: "extraMonster", player: 0, slot: 0 });
    expect(zoneKey({ zone: "extraMonster", player: 0, slot: 1 })).toBe(zoneKey({ zone: "extraMonster", player: 1, slot: 1 }));
  });

  it("knows who went first from the turn counter", () => {
    expect(engineFirst({ turn: 1, turnPlayer: 1 })).toBe(1);
    expect(engineFirst({ turn: 2, turnPlayer: 0 })).toBe(1);
    expect(engineFirst({ turn: 4, turnPlayer: 1 })).toBe(0);
  });

  it("locates cards, materials and EMZ monsters on a board", () => {
    const p0 = emptyPlayer(), p1 = emptyPlayer();
    const xyz = card("e1-4-6", 77, { controller: 1, materials: [card("e1-4-6-m0", 78), card("e1-4-6-m1", 79)] });
    const b: BoardState = {
      players: [{ ...p0, hand: [card("e0-2-0", 10), card("e0-2-1", 11)], gy: [card("e0-16-0", 12), card("e0-16-1", 13)] }, p1],
      extraMonster: [xyz, null], turn: 1, turnPlayer: 0, phase: "main1", log: [],
    };
    const ix = indexBoard(b);
    expect(locateRef(b, { code: 11, controller: 0, location: "hand", sequence: 1 }, ix)?.card.code).toBe(11);
    expect(locateRef(b, { code: 13, controller: 0, location: "gy", sequence: 1 }, ix)?.at).toEqual({ zone: "gy", player: 0, slot: 1 });
    const m = locateRef(b, { code: 79, controller: 1, location: "overlay", sequence: 6, overlay: 1 }, ix);
    expect(m?.card.code).toBe(79);
    expect(m?.host?.uid).toBe("e1-4-6");
    expect(locateRef(b, { code: 77, controller: 1, location: "monster", sequence: 6 }, ix)?.at.zone).toBe("extraMonster");
  });

  it("never shows a prompt code the masked board hides", () => {
    const p0 = emptyPlayer(), p1 = emptyPlayer();
    const b: BoardState = {
      players: [p0, { ...p1, spelltrap: [card("e1-8-0", 0, { faceUp: false, position: "faceDown" }), null, null, null, null] }],
      extraMonster: [null, null], turn: 1, turnPlayer: 0, phase: "main1", log: [],
    };
    expect(visibleCode({ code: 44095762, controller: 1, location: "spelltrap", sequence: 0, position: "faceDown" }, 0, b)).toBe(0);
    // hand / Deck: the server blanks what you may not see (promptMask.ts); a code it does send was revealed to you
    expect(visibleCode({ code: 0, controller: 1, location: "hand", sequence: 0 }, 0, b)).toBe(0);
    expect(visibleCode({ code: 44095762, controller: 1, location: "deck", sequence: 0 }, 0, b)).toBe(44095762);
    expect(visibleCode({ code: 44095762, controller: 1, location: "gy", sequence: 0 }, 0, b)).toBe(44095762);
    expect(visibleCode({ code: 44095762, controller: 0, location: "deck", sequence: 3 }, 0, b)).toBe(44095762);   // your own deck search
  });
});

// ---------------------------------------------------------------------------------------

function refsOf(p: EnginePrompt): EngineCardRef[] {
  switch (p.kind) {
    case "idle": return [...p.summons, ...p.specialSummons, ...p.repositions, ...p.monsterSets, ...p.spellSets, ...p.activates];
    case "battle": return [...p.activates, ...p.attacks];
    case "effectYesNo": return [p.card];
    case "selectCard": case "selectTribute": case "selectChain": case "sort": case "selectCounter": return p.cards;
    case "selectUnselect": return [...p.cards, ...p.selected];
    case "selectSum": return [...p.must, ...p.cards];
    default: return [];
  }
}

// optional real-world decks (Extra Deck monsters, Xyz materials, Pendulums): data/testdeck{0,1}.json
const realDecks = ["data/testdeck0.json", "data/testdeck1.json"].every((f) => existsSync(f))
  ? ["data/testdeck0.json", "data/testdeck1.json"].map((f) => JSON.parse(readFileSync(f, "utf8")) as { main: number[]; extra: number[] })
  : null;
const cases: { name: string; decks: DuelSetup["decks"]; first: Seat }[] = [
  { name: "test decks, seat 0 first", decks: [TEST_DECK_A, TEST_DECK_B], first: 0 },
  { name: "test decks, seat 1 first", decks: [TEST_DECK_A, TEST_DECK_B], first: 1 },
  ...(realDecks ? [0, 1].map((f) => ({ name: `data/testdeck*.json, seat ${f} first`, decks: [realDecks[0], realDecks[1]] as DuelSetup["decks"], first: f as Seat })) : []),
];

describe.skipIf(!engineDataAvailable)("engine ref -> board mapping against real duels", () => {
  for (const { name, decks, first } of cases) {
    it(`every prompt ref and open zone maps onto toBoardState (${name})`, async () => {
      const setup: DuelSetup = { seed: ["5", "36", "67", "158"], decks: [{ main: decks[0].main, extra: decks[0].extra }, { main: decks[1].main, extra: decks[1].extra }], names: ["A", "B"], first };
      const duel = await EngineDuel.create(await nodeCore(), nodeData().data, setup);
      const rng = seededRng(3 + first);
      let checked = 0, places = 0, overlays = 0, emz = 0;
      for (let step = 0; step < 700 && !duel.finished; step++) {
        const p = duel.prompt!;
        const board = duel.toBoardState(null);
        expect(engineFirst(board)).toBe(first);
        const ix = indexBoard(board);
        for (const r of refsOf(p)) {
          const at = locateRef(board, r, ix);
          expect(at, `${p.kind} ref ${JSON.stringify(r)}`).not.toBeNull();
          // (on the field a card's current code can differ from its printed one: "this card's name becomes ...")
          if (r.code && r.location !== "monster" && r.location !== "spelltrap") expect(at!.card.code, `${p.kind} ref ${JSON.stringify(r)}`).toBe(r.code);
          if (r.location !== "deck" && r.location !== "hand" && r.location !== "gy" && r.location !== "banished" && r.location !== "extra") {
            expect(zoneKey(refZone(r, first))).toBe(zoneKey(at!.at));
          }
          checked++;
          if (r.location === "overlay") overlays++;
          if (r.location === "monster" && r.sequence >= 5) emz++;
        }
        if (p.kind === "selectPlace" && !p.disabling) {
          for (const pl of p.places) {
            const z = placeZone(pl, first);
            const occupant = z.zone === "extraMonster" ? board.extraMonster[z.slot!] : z.zone === "field" ? board.players[z.player].field : board.players[z.player][z.zone as "monster" | "spelltrap"][z.slot!];
            expect(occupant, `place ${JSON.stringify(pl)}`).toBeNull();
            places++;
          }
        }
        await duel.respond(p.player, botResponse(p, rng));
      }
      console.log(`${name}: ${checked} refs (${emz} in EMZ, ${overlays} materials), ${places} open zones, finished=${duel.finished}`);
      expect(checked).toBeGreaterThan(100);
      expect(places).toBeGreaterThan(5);
    });
  }
});
