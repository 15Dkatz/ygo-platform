// Movement animations from REAL engine events (stacked hands through the rules engine): a Tribute
// rises away, Synchro materials fly into the new monster, a Deck card sent to the GY is a mill.
import { describe, expect, it } from "vitest";
import { Player } from "../../../../worker/duel/engine/comboHarness.ts";
import { eventsFor } from "../../../../worker/duel/engine/EngineDuel.ts";
import { engineDataAvailable } from "../../../../worker/duel/engine/testHarness.ts";
import type { BoardState } from "../../../../shared/duel.ts";
import { engineIntents, type Intent } from "./intents.ts";

type Move = Extract<Intent, { t: "move" }>;
async function step(p: Player, run: () => Promise<void>): Promise<Move[]> {
  const before: BoardState = p.duel.toBoardState(0);
  await run();
  const after: BoardState = p.duel.toBoardState(0);
  return engineIntents(eventsFor(p.lastEvents, 0), before, after).filter((i): i is Move => i.t === "move");
}

describe.skipIf(!engineDataAvailable)("movement animations from real engine events", () => {
  it("a Tribute Summon's tribute rises away (style 'tribute')", async () => {
    const p = await Player.start({ hand: [91152256, 43422537, 70781052] });   // Celtic Guardian, Double Summon, Summoned Skull
    await p.act("summon", 91152256);
    await p.act("activate", 43422537);
    const moves = await step(p, () => p.act("summon", 70781052, { pick: [91152256] }));
    expect(moves.find((m) => m.code === 91152256)?.style).toBe("tribute");
  });

  it("Synchro materials fly into the new monster (style 'material', aimed at it)", async () => {
    // Genex Controller (Tuner) + Gene-Warped Warwolf via Double Summon -> Black Rose Dragon
    const p = await Player.start({ hand: [68505803, 69247929, 43422537], extra: [73580471] });
    await p.act("summon", 68505803);
    await p.act("activate", 43422537);
    await p.act("summon", 69247929);
    const moves = await step(p, () => p.act("specialSummon", 73580471, { pick: [68505803, 69247929], decline: [73580471] }));
    const mats = moves.filter((m) => m.code === 68505803 || m.code === 69247929);
    expect(mats.length).toBe(2);
    for (const m of mats) { expect(m.style).toBe("material"); expect(m.via?.uid).toBeTruthy(); }
  });

  it("a card sent from the Deck to the GY is milled (style 'mill', face-up)", async () => {
    const p = await Player.start({ hand: [81439173], next: [9365703] });          // Foolish Burial -> Speed Warrior
    const moves = await step(p, () => p.act("activate", 81439173, { pick: [9365703] }));
    const mill = moves.find((m) => m.code === 9365703);
    expect(mill?.style).toBe("mill");
    expect(mill?.faceUp).toBe(true);
  });

  it("revealing the top of the Deck is an excavate", () => {
    const b = { players: [{ name: "a", lp: 8000, deck: [], hand: [], extra: [], gy: [], banished: [], monster: [null, null, null, null, null], spelltrap: [null, null, null, null, null], field: null, pendulum: [null, null] }, { name: "b", lp: 8000, deck: [], hand: [], extra: [], gy: [], banished: [], monster: [null, null, null, null, null], spelltrap: [null, null, null, null, null], field: null, pendulum: [null, null] }], extraMonster: [null, null], turn: 1, turnPlayer: 0, phase: "main1", log: [] } as unknown as BoardState;
    const ints = engineIntents([{ e: "confirm", player: 0, cards: [{ code: 1, controller: 0, location: "deck", sequence: 39 }, { code: 2, controller: 0, location: "deck", sequence: 38 }] }], b, b);
    expect(ints).toContainEqual(expect.objectContaining({ t: "excavate", codes: [1, 2] }));
  });
});
