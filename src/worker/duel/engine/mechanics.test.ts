// Summon mechanics through the real rules engine (backend only, no UI), with stacked opening hands:
// Kewl Tune's hand-material Synchros, Fusion, Ritual, Link, Pendulum and Tribute Summons. Each test
// plays a real line and checks the board, and checks what the rules must NOT allow. These guard the
// engine integration (prompt decoding/encoding, card data, scripts) against future changes.
import { describe, expect, it } from "vitest";
import { codes, field, Player, sorted } from "./comboHarness.ts";
import { clearEngineCaches } from "./data.ts";
import { engineDataAvailable } from "./testHarness.ts";

const K = {
  reco: 89392810, mix: 16509007, cue: 16387555,               // Kewl Tune Tuners: Lv3, Lv2, Lv3
  rs: 15665977, remix: 88170262, loudnessWar: 41069676, trackMaker: 42781164,   // Kewl Tune Synchros
  synchroSpell: 78058681,                                     // "Kewl Tune Synchro"
};
const KEWL_EXTRA = [K.rs, K.remix, K.loudnessWar, K.trackMaker];
const C = {
  genex: 68505803, foolishBurial: 81439173, monsterReborn: 83764718, celtic: 91152256, gemini: 69140098, babyDragon: 88819587,
  poly: 24094653, instantFusion: 1845204, flameManipulator: 34460851, masaki: 44287299, flameSwordsman: 45231177,
  blackLusterRitual: 55761792, blackLusterSoldier: 5405694,
  kuriboh: 40640057, linkuriboh: 41999284, proxyDragon: 22862454, doubleSummon: 43422537,
  stargazer: 94415058, timegazer: 20409757,
  summonedSkull: 70781052, blueEyes: 89631139,
};

describe.skipIf(!engineDataAvailable)("Kewl Tune: a Tuner in the hand as Synchro Material", () => {
  it("Kewl Tune Reco on the field + Kewl Tune Mix from the HAND → Kewl Tune RS", async () => {
    clearEngineCaches();
    const p = await Player.start({ hand: [K.reco], next: [K.mix], extra: KEWL_EXTRA, chain: [K.reco] });
    await p.act("summon", K.reco, { pick: [K.mix] });          // Reco's trigger: add a non-Lv3 "Kewl Tune" monster
    expect(p.hand()).toContain(K.mix);
    expect(p.monsters(), "Mix is still in the hand").toEqual([K.reco]);
    // Reco (Lv3, field) + Mix (Lv2, hand) = 5: RS ("Kewl Tune Reco" + Tuners) and Remix ("Kewl Tune Mix" + Tuners)
    expect(p.extraOffers()).toEqual(sorted([K.rs, K.remix]));

    await p.act("specialSummon", K.rs, { pick: [K.reco, K.mix] });
    expect(p.monsters()).toEqual([K.rs]);
    expect(p.hand(), "Mix left the hand as material").not.toContain(K.mix);
    expect(p.gy()).toEqual(sorted([K.reco, K.mix]));
    expect(p.atk(K.rs), "RS gains 300 per Tuner in the GYs: 1700 + 2 x 300").toBe(2300);
  });

  it("the hand clause belongs to the Kewl Tune on the field: Reco on field + Genex in hand works, not the reverse", async () => {
    // Reco (field, Lv3) + Genex Controller (hand, Lv3 Tuner) = 6 → Kewl Tune Loudness War ("2+ Tuners")
    const a = await Player.start({ hand: [K.reco, C.genex], extra: KEWL_EXTRA, chain: [] });
    await a.act("summon", K.reco, { decline: [K.reco] });
    expect(a.extraOffers()).toContain(K.loudnessWar);
    await a.act("specialSummon", K.loudnessWar, { pick: [K.reco, C.genex] });
    expect(a.monsters()).toEqual([K.loudnessWar]);
    expect(a.hand(), "Genex was used from the hand").not.toContain(C.genex);

    // Genex on the field + Reco in the hand: Genex has no such clause, so nothing is offered
    const b = await Player.start({ hand: [C.genex, K.reco], extra: KEWL_EXTRA, chain: [] });
    await b.act("summon", C.genex);
    expect(b.monsters()).toEqual([C.genex]);
    expect(b.extraOffers(), "a Tuner in the hand alone can't be material").toEqual([]);
  });

  it("Kewl Tune Cue's summon locks you into Tuners: Monster Reborn on a non-Tuner is no longer allowed", async () => {
    const p = await Player.start({ hand: [K.cue, C.foolishBurial, C.monsterReborn], next: [K.mix], extra: KEWL_EXTRA, chain: [K.cue] });
    await p.act("activate", C.foolishBurial, { pick: [C.celtic] });       // a non-Tuner in the GY
    expect(p.gy()).toContain(C.celtic);
    expect(p.offered("activate", C.monsterReborn), "Monster Reborn works before the lock").toBe(true);

    await p.act("summon", K.cue, { pick: [K.mix], decline: [K.mix] });     // Cue: Special Summon Mix from the Deck
    expect(p.monsters()).toEqual(sorted([K.cue, K.mix]));
    expect(p.offered("activate", C.monsterReborn), "only Tuners can be Special Summoned now").toBe(false);
  });

  it("Kewl Tune Synchro: searches, then Synchro Summons in the middle of resolving (Reco on field + the searched Mix in hand)", async () => {
    const p = await Player.start({ hand: [K.reco, K.synchroSpell], next: [K.mix], extra: KEWL_EXTRA, chain: [] });
    await p.act("summon", K.reco, { decline: [K.reco] });
    await p.act("activate", K.synchroSpell, { pick: [K.mix, K.rs, K.reco, K.mix] });
    expect(p.monsters(), "RS was Synchro Summoned by the spell").toEqual([K.rs]);
    expect(p.gy()).toEqual(sorted([K.reco, K.mix, K.synchroSpell]));
    expect(p.hand()).not.toContain(K.mix);
  });
});

describe.skipIf(!engineDataAvailable)("Fusion", () => {
  const extra = [C.flameSwordsman];

  it("Polymerization fuses two monsters from the hand", async () => {
    clearEngineCaches();
    const p = await Player.start({ hand: [C.poly, C.flameManipulator, C.masaki], extra });
    await p.act("activate", C.poly, { pick: [C.flameSwordsman, C.flameManipulator, C.masaki] });
    expect(p.monsters()).toEqual([C.flameSwordsman]);
    expect(p.gy()).toEqual(sorted([C.poly, C.flameManipulator, C.masaki]));
    expect(p.board.players[0].extra.length).toBe(0);
  });

  it("Polymerization can use a material on the field and one in the hand", async () => {
    const p = await Player.start({ hand: [C.masaki, C.poly, C.flameManipulator], extra });
    await p.act("summon", C.masaki);
    await p.act("activate", C.poly, { pick: [C.flameSwordsman, C.masaki, C.flameManipulator] });
    expect(p.monsters()).toEqual([C.flameSwordsman]);
    expect(p.gy()).toEqual(sorted([C.poly, C.flameManipulator, C.masaki]));
  });

  it("Polymerization can't be activated without the right materials", async () => {
    const p = await Player.start({ hand: [C.poly, C.masaki, C.celtic], extra });
    expect(p.offered("activate", C.poly)).toBe(false);
  });

  it("Instant Fusion pays 1000 LP and summons a Level 5 or lower Fusion from the Extra Deck", async () => {
    const p = await Player.start({ hand: [C.instantFusion], extra });
    await p.act("activate", C.instantFusion, { pick: [C.flameSwordsman] });
    expect(p.monsters()).toEqual([C.flameSwordsman]);
    expect(p.lp[0]).toBe(7000);
  });
});

describe.skipIf(!engineDataAvailable)("Ritual, Link, Pendulum, Tribute", () => {
  it("Ritual: Black Luster Ritual tributes Levels totalling 8 for Black Luster Soldier", async () => {
    clearEngineCaches();
    const p = await Player.start({ hand: [C.blackLusterRitual, C.blackLusterSoldier, C.gemini, C.celtic] });
    await p.act("activate", C.blackLusterRitual, { pick: [C.blackLusterSoldier, C.gemini, C.celtic] });
    expect(p.monsters()).toEqual([C.blackLusterSoldier]);
    expect(p.atk(C.blackLusterSoldier)).toBe(3000);
    expect(p.gy()).toEqual(sorted([C.blackLusterRitual, C.gemini, C.celtic]));
  });

  it("Ritual can't be activated when the Levels available total less than 8", async () => {
    // Celtic Guardian (4) + Baby Dragon (3) = 7
    const p = await Player.start({ hand: [C.blackLusterRitual, C.blackLusterSoldier, C.celtic, C.babyDragon, C.poly] });
    expect(p.offered("activate", C.blackLusterRitual)).toBe(false);
  });

  it("Link: Linkuriboh from a Level 1, and the first Link Monster goes to an Extra Monster Zone", async () => {
    const p = await Player.start({ hand: [C.kuriboh], extra: [C.linkuriboh, C.proxyDragon] });
    await p.act("summon", C.kuriboh);
    expect(p.extraOffers(), "Proxy Dragon needs 2 monsters").toEqual([C.linkuriboh]);
    await p.act("specialSummon", C.linkuriboh, { pick: [C.kuriboh] });
    const b = p.board;
    expect(codes(b.extraMonster), "in an Extra Monster Zone").toEqual([C.linkuriboh]);
    expect(codes(b.players[0].monster)).toEqual([]);
    expect(p.gy()).toEqual([C.kuriboh]);
  });

  it("Link: Proxy Dragon from 2 monsters (Double Summon)", async () => {
    const p = await Player.start({ hand: [C.celtic, C.gemini, C.doubleSummon], extra: [C.linkuriboh, C.proxyDragon] });
    await p.act("summon", C.celtic);
    await p.act("activate", C.doubleSummon);
    await p.act("summon", C.gemini);
    expect(p.extraOffers()).toEqual([C.proxyDragon]);
    await p.act("specialSummon", C.proxyDragon, { pick: [C.celtic, C.gemini] });
    expect(codes(p.board.extraMonster)).toEqual([C.proxyDragon]);
    expect(p.gy()).toEqual(sorted([C.celtic, C.gemini, C.doubleSummon]));
  });

  it("Pendulum: Stargazer (scale 1) + Timegazer (scale 8) set the scales, then two Level 4s are Pendulum Summoned at once", async () => {
    const p = await Player.start({ hand: [C.stargazer, C.timegazer, C.celtic, C.gemini, C.blueEyes] });
    await p.act("activate", C.stargazer, { from: "hand" });
    await p.act("activate", C.timegazer, { from: "hand" });
    // Master Rule 5: the Pendulum Zones are your leftmost and rightmost Spell & Trap Zones
    const st = p.board.players[0].spelltrap;
    expect(codes([st[0], st[4]])).toEqual(sorted([C.stargazer, C.timegazer]));
    const pend = p.idle.specialSummons.find((c) => c.location === "pendulum" || c.location === "spelltrap");
    expect(pend, `a Pendulum Summon is offered: ${JSON.stringify(p.idle.specialSummons)}`).toBeTruthy();
    await p.act("specialSummon", pend!.code, { from: pend!.location, pick: [C.celtic, C.gemini] });
    expect(p.monsters(), "both summoned together; Blue-Eyes (Lv8) can't be").toEqual(sorted([C.celtic, C.gemini]));
    expect(p.hand()).toContain(C.blueEyes);
  });

  it("Tribute Summon: Level 5-6 needs 1 tribute, Level 7+ needs 2", async () => {
    const p = await Player.start({ hand: [C.celtic, C.doubleSummon, C.summonedSkull, C.blueEyes] });
    await p.act("summon", C.celtic);
    await p.act("activate", C.doubleSummon);
    expect(p.offered("summon", C.summonedSkull), "Lv6 with 1 monster to tribute").toBe(true);
    expect(p.offered("summon", C.blueEyes), "Lv8 needs 2 tributes").toBe(false);
    await p.act("summon", C.summonedSkull, { pick: [C.celtic] });
    expect(p.monsters()).toEqual([C.summonedSkull]);
    expect(p.gy()).toEqual(sorted([C.doubleSummon, C.celtic]));
  });
});
