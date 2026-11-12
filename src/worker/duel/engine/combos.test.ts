// Real Synchro / Xyz combos through the rules engine (ocgcore + the official card scripts), backend only.
// Each test stacks the Deck (stackedForTesting) so the opening hand is exactly the combo pieces, plays
// the combo as the first player would, and checks the board after each step: what the engine offers,
// where materials go, tokens, triggers, ATK. Also checks summons the rules must NOT allow.
import { describe, expect, it } from "vitest";
import { clearEngineCaches } from "./data.ts";
import { codes, field, Player as BasePlayer, sorted } from "./comboHarness.ts";
import { engineDataAvailable } from "./testHarness.ts";

const C = {
  junkSynchron: 63977008, speedWarrior: 9365703, doppelwarrior: 53855409, doppelToken: 53855410,
  foolishBurial: 81439173, monsterReborn: 83764718, genex: 68505803,
  doppelToken2: 53855411,   // Doppelwarrior makes one of each token artwork (id+1, id+2)
  junkWarrior: 60800381, blackRose: 73580471, stardust: 44508094,
  captain: 2460565, warwolf: 69247929, celtic: 91152256, doubleSummon: 43422537,
  utopia: 84013237, pearl: 71594310, exciton: 46772449, mysticalElf: 15025844, mst: 5318639,
};
const SYNCHRO_EXTRA = [C.junkWarrior, C.blackRose, C.stardust];
const XYZ_EXTRA = [C.utopia, C.pearl, C.exciton];

/** The combo player for these tests: chains the combos' monster triggers. */
const Player = {
  start: (hand: number[], next: number[], extra: number[]) =>
    BasePlayer.start({ hand, next, extra, chain: [C.junkSynchron, C.doppelwarrior, C.junkWarrior, C.captain] }),
};

describe.skipIf(!engineDataAvailable)("Synchro combos (stacked hands, backend engine)", () => {
  it("opening hand is exactly the stacked cards", async () => {
    clearEngineCaches();
    const p = await Player.start([C.foolishBurial, C.junkSynchron, C.doppelwarrior, C.genex, C.monsterReborn], [], SYNCHRO_EXTRA);
    expect(codes(p.board.players[0].hand)).toEqual(sorted([C.foolishBurial, C.junkSynchron, C.doppelwarrior, C.genex, C.monsterReborn]));
    expect(p.board.players[0].extra.length).toBe(3);
  });

  it("Junk Synchron revives Speed Warrior → Junk Warrior (Lv 3 + 2 = 5)", async () => {
    const p = await Player.start([C.foolishBurial, C.junkSynchron, C.celtic, C.celtic, C.celtic], [C.speedWarrior], SYNCHRO_EXTRA);
    await p.act("activate", C.foolishBurial, { pick: [C.speedWarrior] });          // send Speed Warrior from Deck to GY
    expect(p.board.players[0].gy.map((c) => c.code)).toContain(C.speedWarrior);
    expect(p.extraOffers(), "nothing summonable yet").toEqual([]);

    await p.act("summon", C.junkSynchron, { pick: [C.speedWarrior] });  // its trigger: Special Summon Speed Warrior from GY
    expect(codes(field(p.board, 0))).toEqual(sorted([C.speedWarrior, C.junkSynchron]));
    expect(field(p.board, 0).find((c) => c.code === C.speedWarrior)?.position, "revived in Defense Position").toBe("def");
    expect(p.extraOffers(), "only Junk Warrior fits Lv 5 with a Junk Synchron").toEqual([C.junkWarrior]);

    await p.act("specialSummon", C.junkWarrior, { pick: [C.junkSynchron, C.speedWarrior] });
    const b = p.board;
    expect(codes(field(b, 0))).toEqual([C.junkWarrior]);
    expect(codes(b.players[0].gy)).toEqual(sorted([C.foolishBurial, C.junkSynchron, C.speedWarrior]));
    expect(b.players[0].extra.length).toBe(2);
    expect(p.atk(C.junkWarrior), "no Level 2 or lower monsters left, so no ATK gain").toBe(2300);
  });

  it("Junk Doppel: Doppelwarrior joins from hand, its material effect makes 2 tokens, Junk Warrior powers up", async () => {
    const p = await Player.start([C.foolishBurial, C.junkSynchron, C.doppelwarrior, C.celtic, C.celtic], [C.speedWarrior], SYNCHRO_EXTRA);
    await p.act("activate", C.foolishBurial, { pick: [C.speedWarrior] });
    await p.act("summon", C.junkSynchron, { pick: [C.speedWarrior] });
    // Speed Warrior was Special Summoned from the GY -> Doppelwarrior may Special Summon itself from the hand
    expect(codes(field(p.board, 0)), "Junk Synchron, Speed Warrior, Doppelwarrior").toEqual(sorted([C.speedWarrior, C.junkSynchron, C.doppelwarrior]));
    expect(p.extraOffers()).toEqual(sorted([C.junkWarrior, C.blackRose]));    // 3+2 = 5 and 3+2+2 = 7

    const traceFrom = p.trace.length;
    await p.act("specialSummon", C.junkWarrior, { pick: [C.junkSynchron, C.doppelwarrior] });
    const b = p.board;
    const f = codes(field(b, 0));
    if (process.env.COMBO_DEBUG) console.log("DOPPEL", JSON.stringify(f), p.trace.slice(traceFrom).join(" || "));
    expect(f.filter((c) => c === C.doppelToken || c === C.doppelToken2).length, "Doppelwarrior made 2 Doppel Tokens").toBe(2);
    expect(f).toContain(C.junkWarrior);
    expect(f).toContain(C.speedWarrior);
    const atk = p.atk(C.junkWarrior);
    // Junk Warrior gains the ATK of your Level 2 or lower monsters when its trigger resolves:
    // Speed Warrior 900 (+ 400 per token, if the tokens' trigger resolved first)
    // the tokens' trigger resolves first (it was chained last), so Junk Warrior counts them too:
    // 2300 + Speed Warrior 900 + 2 tokens x 400 = 4000 (the classic "Junk Doppel" result)
    expect(atk, "Junk Warrior ATK").toBe(4000);
  });

  it("Black Rose Dragon from a Tuner + 2 non-Tuners (3 + 2 + 2 = 7), materials to the GY", async () => {
    const p = await Player.start([C.foolishBurial, C.junkSynchron, C.doppelwarrior, C.celtic, C.celtic], [C.speedWarrior], SYNCHRO_EXTRA);
    await p.act("activate", C.foolishBurial, { pick: [C.speedWarrior] });
    await p.act("summon", C.junkSynchron, { pick: [C.speedWarrior] });
    await p.act("specialSummon", C.blackRose, { pick: [C.junkSynchron, C.speedWarrior, C.doppelwarrior], decline: [C.blackRose] });  // decline its board wipe
    const b = p.board;
    const f = codes(field(b, 0));
    expect(f).toContain(C.blackRose);
    expect(f.filter((c) => c === C.doppelToken || c === C.doppelToken2).length, "Doppelwarrior was a material: 2 tokens").toBe(2);
    expect(b.players[0].gy.map((c) => c.code)).toEqual(expect.arrayContaining([C.junkSynchron, C.speedWarrior, C.doppelwarrior]));
    expect(p.atk(C.blackRose)).toBe(2400);
  });

  it("does NOT offer Junk Warrior without a Junk Synchron, or a Synchro whose Level doesn't match", async () => {
    // Genex Controller (Tuner, Lv3) + Speed Warrior (Lv2) = 5, but Junk Warrior needs "Junk Synchron" as its Tuner
    const p = await Player.start([C.foolishBurial, C.monsterReborn, C.genex, C.celtic, C.celtic], [C.speedWarrior], SYNCHRO_EXTRA);
    await p.act("activate", C.foolishBurial, { pick: [C.speedWarrior] });
    await p.act("activate", C.monsterReborn, { pick: [C.speedWarrior] });
    await p.act("summon", C.genex);
    expect(codes(field(p.board, 0))).toEqual(sorted([C.speedWarrior, C.genex]));
    expect(p.extraOffers(), "no Synchro Summon possible").toEqual([]);
  });
});

describe.skipIf(!engineDataAvailable)("Xyz combos (stacked hands, backend engine)", () => {
  it("Double Summon two Level 4s → Number 39: Utopia with 2 materials", async () => {
    const p = await Player.start([C.warwolf, C.celtic, C.doubleSummon, C.mysticalElf, C.mysticalElf], [], XYZ_EXTRA);
    await p.act("summon", C.warwolf);
    expect(p.extraOffers()).toEqual([]);
    await p.act("activate", C.doubleSummon);
    await p.act("summon", C.celtic);
    expect(p.extraOffers(), "every Rank 4 is offered").toEqual(sorted([...XYZ_EXTRA]));
    await p.act("specialSummon", C.utopia, { pick: [C.warwolf, C.celtic] });
    const b = p.board;
    const utopia = field(b, 0).find((c) => c.code === C.utopia)!;
    expect(utopia).toBeTruthy();
    expect(codes(utopia.materials ?? [])).toEqual(sorted([C.warwolf, C.celtic]));
    expect(field(b, 0).length, "the materials left the field").toBe(1);
    expect(b.players[0].gy.map((c) => c.code), "materials are attached, not in the GY").toEqual([C.doubleSummon]);
    expect(p.atk(C.utopia)).toBe(2500);
  });

  it("Evilswarm Exciton Knight detaches a material (to the GY) to destroy the other cards", async () => {
    const p = await Player.start([C.warwolf, C.celtic, C.doubleSummon, C.mst, C.mysticalElf], [], XYZ_EXTRA);
    await p.act("spellSet", C.mst);       // something else on the field for Exciton to destroy
    await p.act("summon", C.warwolf);
    await p.act("activate", C.doubleSummon);
    await p.act("summon", C.celtic);
    await p.act("specialSummon", C.exciton, { pick: [C.warwolf, C.celtic] });
    // its effect needs the opponent to have more cards (hand + field) than you: 5 vs my 2 in hand + Exciton
    await p.act("activate", C.exciton, { pick: [C.warwolf] });
    const b = p.board;
    const ex = field(b, 0).find((c) => c.code === C.exciton)!;
    expect(ex.materials?.length, "1 material detached").toBe(1);
    const gy = b.players[0].gy.map((c) => c.code);
    expect(gy, "the detached material went to the GY").toContain(ex.materials![0].code === C.celtic ? C.warwolf : C.celtic);
    expect(gy, "the set Mystical Space Typhoon was destroyed").toContain(C.mst);
    expect(b.players[0].spelltrap.every((c) => !c), "no other cards left on my field").toBe(true);
  });

  it("does NOT offer a Rank 4 from Marauding Captain (Lv3) + the Level 4 it summons", async () => {
    const p = await Player.start([C.captain, C.warwolf, C.mysticalElf, C.mysticalElf, C.mysticalElf], [], XYZ_EXTRA);
    await p.act("summon", C.captain, { pick: [C.warwolf] });    // its trigger: Special Summon a Lv4 or lower from hand
    expect(codes(field(p.board, 0))).toEqual(sorted([C.captain, C.warwolf]));
    expect(p.extraOffers(), "Lv3 + Lv4 can't make a Rank 4").toEqual([]);
  });
});
