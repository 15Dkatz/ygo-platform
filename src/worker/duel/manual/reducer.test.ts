import { describe, expect, it } from "vitest";
import { HIDDEN_CODE, type BoardState } from "../../../shared/duel.ts";
import { validateDeck, type DuelAction, type Seat } from "../../../shared/duelActions.ts";
import { allCards, createBoard, findCard, type Rng } from "./board.ts";
import { ActionError, applyAction } from "./reducer.ts";
import { maskBoard } from "./mask.ts";

/** Deterministic RNG: index 0 every time, sequential uids. */
function testRng(): Rng {
  let n = 0;
  return { int: () => 0, uid: () => `u${++n}` };
}

const main = (base: number) => Array.from({ length: 40 }, (_, i) => base + i);
function setup(): { b: BoardState; rng: Rng } {
  const rng = testRng();
  const b = createBoard(["Alice", "Bob"], [{ main: main(1000), extra: [9001, 9002] }, { main: main(2000), extra: [9101] }], 0, rng);
  return { b, rng };
}
const act = (b: BoardState, actor: Seat, a: DuelAction, rng: Rng) => applyAction(b, actor, a, rng);

describe("setup", () => {
  it("deals 5, 8000 LP, keeps every card", () => {
    const { b } = setup();
    expect(b.players[0].hand).toHaveLength(5);
    expect(b.players[0].deck).toHaveLength(35);
    expect(b.players[1].extra).toHaveLength(1);
    expect(b.players[0].lp).toBe(8000);
    expect(b.turnPlayer).toBe(0);
    expect(allCards(b)).toHaveLength(83);
    expect(new Set(allCards(b).map((c) => c.uid)).size).toBe(83);
  });
  it("validates decks", () => {
    expect(validateDeck({ main: main(1), extra: [], side: [] })).toBeNull();
    expect(validateDeck({ main: main(1).slice(0, 39), extra: [] })).toMatch(/40/);
    expect(validateDeck({ main: [...main(1), 1.5], extra: [] })).toMatch(/integers/);
    expect(validateDeck({ main: main(1), extra: Array(16).fill(1) })).toMatch(/Extra/);
    expect(validateDeck({ main: main(1), extra: [], side: Array(16).fill(1) })).toMatch(/Side/);
    expect(validateDeck({ main: "x" as unknown, extra: [] })).toMatch(/integers/);
  });
});

describe("actions", () => {
  it("draws and logs without mutating the input", () => {
    const { b, rng } = setup();
    const r = act(b, 0, { type: "draw" }, rng);
    expect(r.board.players[0].hand).toHaveLength(6);
    expect(b.players[0].hand).toHaveLength(5);
    expect(r.board.log.at(-1)).toBe("Alice draws 1 card.");
    expect(() => act({ ...b, players: [{ ...b.players[0], deck: [] }, b.players[1]] }, 0, { type: "draw" }, rng)).toThrow(/empty/);
  });

  it("summons, sets, flips and changes position", () => {
    const { b, rng } = setup();
    const [h1, h2, h3] = b.players[0].hand;
    let s = act(b, 0, { type: "summon", uid: h1.uid }, rng).board;
    expect(s.players[0].monster[0]).toMatchObject({ uid: h1.uid, faceUp: true, position: "atk" });
    expect(s.log.at(-1)).toBe(`Alice Normal Summons [[${h1.code}]] in ATK Position.`);

    s = act(s, 0, { type: "set", uid: h2.uid, zone: "monster" }, rng).board;
    expect(s.players[0].monster[1]).toMatchObject({ faceUp: false, position: "faceDownDef" });
    expect(s.log.at(-1)).toBe("Alice Sets a monster.");

    s = act(s, 0, { type: "set", uid: h3.uid, zone: "spelltrap", slot: 2 }, rng).board;
    expect(s.players[0].spelltrap[2]).toMatchObject({ faceUp: false, position: "faceDown" });

    s = act(s, 0, { type: "flip", uid: h2.uid }, rng).board;
    expect(s.players[0].monster[1]).toMatchObject({ faceUp: true, position: "atk" });

    s = act(s, 0, { type: "position", uid: h1.uid, position: "def" }, rng).board;
    expect(s.players[0].monster[0]!.position).toBe("def");

    s = act(s, 0, { type: "activate", uid: h3.uid }, rng).board;
    expect(s.players[0].spelltrap[2]).toMatchObject({ faceUp: true });
    expect(s.players[0].spelltrap[2]!.position).toBeUndefined();
    expect(s.log.at(-1)).toBe(`Alice activates [[${h3.code}]].`);
  });

  it("rejects occupied zones and moving the opponent's cards", () => {
    const { b, rng } = setup();
    const [h1, h2] = b.players[0].hand;
    const s = act(b, 0, { type: "summon", uid: h1.uid, slot: 2 }, rng).board;
    expect(() => act(s, 0, { type: "summon", uid: h2.uid, slot: 2 }, rng)).toThrow(ActionError);
    expect(() => act(s, 1, { type: "move", uid: h1.uid, to: { zone: "gy" } }, rng)).toThrow(/not under your control/);
    expect(() => act(s, 1, { type: "move", uid: h2.uid, to: { zone: "hand" } }, rng)).toThrow(/not under your control/);
    expect(() => act(s, 0, { type: "move", uid: "nope", to: { zone: "gy" } }, rng)).toThrow(/no longer there/);
  });

  it("moves between piles; piles always belong to the owner", () => {
    const { b, rng } = setup();
    const h1 = b.players[0].hand[0];
    let s = act(b, 0, { type: "move", uid: h1.uid, to: { zone: "gy", player: 1 } }, rng).board;
    expect(s.players[0].gy.at(-1)!.uid).toBe(h1.uid);
    expect(s.players[1].gy).toHaveLength(0);
    expect(s.log.at(-1)).toBe(`Alice sends [[${h1.code}]] from the hand to the GY.`);
    s = act(s, 0, { type: "move", uid: h1.uid, to: { zone: "deck", deckPos: "bottom" } }, rng).board;
    expect(s.players[0].deck.at(-1)!.uid).toBe(h1.uid);
    s = act(s, 0, { type: "move", uid: h1.uid, to: { zone: "banished", faceUp: false } }, rng).board;
    expect(s.players[0].banished[0]).toMatchObject({ faceUp: false });
    expect(s.log.at(-1)).toBe("Alice banishes a card from the Deck face-down.");
  });

  it("returns Extra Deck monsters to the Extra Deck", () => {
    const { b, rng } = setup();
    const e = b.players[0].extra[0];
    let s = act(b, 0, { type: "summon", uid: e.uid, zone: "extraMonster", slot: 0 }, rng).board;
    expect(s.extraMonster[0]).toMatchObject({ uid: e.uid, controller: 0 });
    expect(s.log.at(-1)).toMatch(/Special Summons \[\[9001\]\] from the Extra Deck/);
    s = act(s, 0, { type: "move", uid: e.uid, to: { zone: "deck" } }, rng).board;
    expect(s.players[0].extra.map((c) => c.uid)).toContain(e.uid);
    expect(s.extraMonster[0]).toBeNull();
  });

  it("attaches and detaches Xyz materials; materials go to the GY with the host", () => {
    const { b, rng } = setup();
    const [h1, h2, h3] = b.players[0].hand;
    const x = b.players[0].extra[0];
    let s = act(b, 0, { type: "summon", uid: x.uid, slot: 0 }, rng).board;
    s = act(s, 0, { type: "attach", uid: h1.uid, targetUid: x.uid }, rng).board;
    s = act(s, 0, { type: "attach", uid: h2.uid, targetUid: x.uid }, rng).board;
    s = act(s, 0, { type: "attach", uid: h3.uid, targetUid: x.uid }, rng).board;
    expect(s.players[0].monster[0]!.materials).toHaveLength(3);
    s = act(s, 0, { type: "detach", targetUid: x.uid, materialUid: h1.uid }, rng).board;
    expect(s.players[0].gy.map((c) => c.uid)).toEqual([h1.uid]);
    s = act(s, 0, { type: "move", uid: x.uid, to: { zone: "gy" } }, rng).board;
    // the Xyz monster is an Extra Deck card, but "gy" is honoured as-is
    expect(s.players[0].gy.map((c) => c.uid)).toEqual([h1.uid, h2.uid, h3.uid, x.uid]);
    expect(s.log.at(-1)).toMatch(/2 Xyz materials sent to the GY/);
  });

  it("changes LP and ends the duel at 0", () => {
    const { b, rng } = setup();
    let r = act(b, 0, { type: "lp", player: 1, delta: -3000 }, rng);
    expect(r.board.players[1].lp).toBe(5000);
    expect(r.board.log.at(-1)).toBe("Alice reduces Bob's LP by 3000: 8000 → 5000.");
    expect(r.finished).toBeUndefined();
    r = act(r.board, 1, { type: "lp", player: 1, delta: -9000 }, rng);
    expect(r.board.players[1].lp).toBe(0);
    expect(r.finished).toEqual({ winner: 0, reason: "Bob's LP reached 0." });
  });

  it("phases and turns belong to the turn player", () => {
    const { b, rng } = setup();
    expect(() => act(b, 1, { type: "endTurn" }, rng)).toThrow(/not your turn/);
    let s = act(b, 0, { type: "phase", phase: "battle" }, rng).board;
    expect(s.phase).toBe("battle");
    s = act(s, 0, { type: "endTurn" }, rng).board;
    expect(s).toMatchObject({ turn: 2, turnPlayer: 1, phase: "draw" });
  });

  it("attacks, takes control, tokens, counters", () => {
    const { b, rng } = setup();
    let s = act(b, 0, { type: "summon", uid: b.players[0].hand[0].uid }, rng).board;
    const mine = s.players[0].monster[0]!;
    const theirs = s.players[1].hand[0];
    s = act(s, 1, { type: "set", uid: theirs.uid, zone: "monster" }, rng).board;
    let r = act(s, 0, { type: "attack", uid: mine.uid, targetUid: theirs.uid }, rng);
    expect(r.board.log.at(-1)).toBe(`Alice's [[${mine.code}]] attacks a face-down monster.`);
    expect(r.events[0]).toMatchObject({ kind: "attack", attacker: mine.uid, target: theirs.uid });
    expect(() => act(s, 0, { type: "attack", uid: mine.uid, targetUid: mine.uid }, rng)).toThrow();
    r = act(s, 0, { type: "attack", uid: mine.uid }, rng);
    expect(r.board.log.at(-1)).toMatch(/attacks directly/);

    expect(() => act(s, 0, { type: "move", uid: theirs.uid, to: { zone: "monster" } }, rng)).toThrow(/not under your control/);
    s = act(s, 0, { type: "takeControl", uid: theirs.uid }, rng).board;
    expect(s.players[0].monster[1]!.uid).toBe(theirs.uid);
    expect(s.log.at(-1)).toBe("Alice takes control of Bob's face-down monster.");
    // it goes back to its owner's GY
    s = act(s, 0, { type: "move", uid: theirs.uid, to: { zone: "gy" } }, rng).board;
    expect(s.players[1].gy.at(-1)!.uid).toBe(theirs.uid);

    s = act(s, 0, { type: "token", position: "def" }, rng).board;
    const tok = s.players[0].monster.find((c) => c?.token)!;
    expect(tok).toMatchObject({ position: "def", faceUp: true });
    s = act(s, 0, { type: "counter", uid: tok.uid, name: "Spell Counter", delta: 2 }, rng).board;
    expect(findCard(s, tok.uid)!.card.counters).toEqual({ "Spell Counter": 2 });
    s = act(s, 0, { type: "move", uid: tok.uid, to: { zone: "gy" } }, rng).board;
    expect(findCard(s, tok.uid)).toBeNull();
    expect(s.log.at(-1)).toMatch(/Token left the field and was removed/);
  });

  it("peeks privately, shuffles with fresh uids, mills, dice, coin, concede", () => {
    const { b, rng } = setup();
    let r = act(b, 0, { type: "lookTop", n: 3 }, rng);
    expect(r.peek!.cards.map((c) => c.uid)).toEqual(b.players[0].deck.slice(0, 3).map((c) => c.uid));
    r = act(b, 0, { type: "shuffle" }, rng);
    expect(r.board.players[0].deck.map((c) => c.uid)).not.toEqual(b.players[0].deck.map((c) => c.uid));
    r = act(b, 0, { type: "mill", n: 2 }, rng);
    expect(r.board.players[0].gy).toHaveLength(2);
    expect(act(b, 0, { type: "dice" }, rng).events[0]).toEqual({ kind: "dice", player: 0, value: 1 });
    expect(act(b, 0, { type: "coin" }, rng).board.log.at(-1)).toBe("Alice flips a coin: Heads.");
    expect(act(b, 1, { type: "concede" }, rng).finished).toMatchObject({ winner: 0 });
    expect(() => act(b, 0, { type: "bogus" } as unknown as DuelAction, rng)).toThrow(/Unknown action/);
  });
});

describe("masking", () => {
  it("hides the opponent's hand, every deck and face-down cards", () => {
    const { b, rng } = setup();
    let s = act(b, 0, { type: "set", uid: b.players[0].hand[0].uid, zone: "spelltrap" }, rng).board;
    s = act(s, 0, { type: "summon", uid: s.players[0].hand[0].uid }, rng).board;
    const forBob = maskBoard(s, 1);
    expect(forBob.players[0].hand.every((c) => c.code === HIDDEN_CODE)).toBe(true);
    expect(forBob.players[1].hand.every((c) => c.code !== HIDDEN_CODE)).toBe(true);
    expect(forBob.players[0].deck.every((c) => c.code === HIDDEN_CODE)).toBe(true);
    expect(forBob.players[1].deck.every((c) => c.code === HIDDEN_CODE)).toBe(true);
    expect(forBob.players[0].spelltrap[0]!.code).toBe(HIDDEN_CODE);
    expect(forBob.players[0].monster[0]!.code).not.toBe(HIDDEN_CODE);
    expect(forBob.players[0].extra.every((c) => c.code === HIDDEN_CODE && c.extraDeck === undefined)).toBe(true);
    const forAlice = maskBoard(s, 0);
    expect(forAlice.players[0].spelltrap[0]!.code).not.toBe(HIDDEN_CODE);
    expect(forAlice.players[0].extra[0].code).toBe(9001);
    const forSpectator = maskBoard(s, null);
    expect(forSpectator.players[0].hand.every((c) => c.code === HIDDEN_CODE)).toBe(true);
    expect(forSpectator.players[0].spelltrap[0]!.code).toBe(HIDDEN_CODE);
    // masking never mutates the authoritative board
    expect(s.players[0].hand[0].code).not.toBe(HIDDEN_CODE);
  });
});
