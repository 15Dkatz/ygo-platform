// Test helper (imported by *.test.ts only): play scripted lines through the real rules engine
// (ocgcore + the official card scripts) with a stacked Deck, so a test chooses its opening hand.
//
//   const p = await Player.start({ hand: [A, B, C], next: [D], extra: [X], chain: [A] });
//   await p.act("summon", A, { pick: [D] });       // do it, then answer what follows, preferring D
//   expect(p.extraOffers()).toEqual([X]);          // what the engine lets you summon now
//
// Seat 0 is "you", going first. Seat 1 never responds (no chains, no optional effects) and ends its turns.
import { OcgLocation, OcgQueryFlags } from "ocgcore-wasm";
import { expect } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineCardRef, EngineEffectRef, EngineEvent, EnginePrompt, EngineResponse } from "../../../shared/enginePrompts.ts";
import { botResponse, seededRng } from "./bot.ts";
import { EngineDuel } from "./EngineDuel.ts";
import { nodeCore, nodeData } from "./testHarness.ts";

export const FILLER = 91152256;        // Celtic Guardian (Normal Lv4)
export const OPP_FILLER = 15025844;    // Mystical Elf (Normal Lv4): the opponent's whole Deck

/** 40 cards: the opening hand (`hand`, topped up to 5 with filler), then `next` (still in the Deck:
 *  the next draws / what searches find), then filler. */
export const stack = (hand: number[], next: number[] = []) => {
  const opening = [...hand, ...Array(Math.max(0, 5 - hand.length)).fill(FILLER)];
  return [...opening, ...next, ...Array(Math.max(0, 40 - opening.length - next.length)).fill(FILLER)];
};

/** Your monsters on the field: Main Monster Zones + the Extra Monster Zone you control. */
export const field = (b: BoardState, seat: 0 | 1 = 0): CardInstance[] => [
  ...b.players[seat].monster.filter((c): c is CardInstance => !!c),
  ...b.extraMonster.filter((c): c is CardInstance => !!c && c.controller === seat),
];
export const codes = (cs: (CardInstance | null)[]) => cs.filter((c): c is CardInstance => !!c).map((c) => c.code).sort((a, b) => a - b);
export const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

type IdleAction = "summon" | "specialSummon" | "activate" | "spellSet" | "monsterSet" | "reposition";

export class Player {
  /** codes to prefer whenever a prompt asks to pick cards (each used as often as it's listed) */
  pick: number[] = [];
  /** optional effects to say no to (everything else: yes) */
  decline: number[] = [];
  /** chain these cards' effects when offered, nothing else */
  chainCodes: number[];
  readonly trace: string[] = [];
  /** Engine events of the last act() / endTurn() (for animation tests). */
  lastEvents: EngineEvent[] = [];
  private rng = seededRng(7);

  private constructor(readonly duel: EngineDuel, chain: number[]) { this.chainCodes = chain; }

  static async start(o: { hand: number[]; next?: number[]; extra?: number[]; chain?: number[]; oppHand?: number[]; lp?: number }) {
    const core = await nodeCore();
    const { data } = nodeData();
    const duel = await EngineDuel.create(core, data, {
      seed: ["1", "2", "3", "4"], first: 0, names: ["Tester", "Opponent"], stackedForTesting: true, startingLP: o.lp,
      decks: [
        { main: stack(o.hand, o.next), extra: o.extra ?? [] },
        { main: [...(o.oppHand ?? []), ...Array(40 - (o.oppHand?.length ?? 0)).fill(OPP_FILLER)], extra: [] },
      ],
    });
    const p = new Player(duel, o.chain ?? []);
    await p.settle();
    return p;
  }

  get board() { return this.duel.toBoardState(null); }
  get lp() { return this.duel.status.lp; }
  get idle() {
    const p = this.duel.prompt;
    if (!p || p.kind !== "idle" || p.player !== 0) throw new Error(`expected my Main Phase, got ${p?.kind} for seat ${p?.player}`);
    return p;
  }
  hand() { return codes(this.board.players[0].hand); }
  gy() { return codes(this.board.players[0].gy); }
  monsters() { return codes(field(this.board, 0)); }
  /** Extra Deck monsters the engine lets me Special Summon right now. */
  extraOffers() { return sorted(this.idle.specialSummons.filter((c) => c.location === "extra").map((c) => c.code)); }
  /** Is `action` on `code` offered right now? */
  offered(action: IdleAction, code: number) { return this.list(action).some((c) => c.code === code); }

  private list(action: IdleAction): EngineCardRef[] {
    const p = this.idle;
    return action === "summon" ? p.summons : action === "specialSummon" ? p.specialSummons : action === "activate" ? p.activates
      : action === "spellSet" ? p.spellSets : action === "monsterSet" ? p.monsterSets : p.repositions;
  }

  /** Do a Main Phase action on card `code`, then answer the prompts that follow. `desc` picks one of a card's effects. */
  async act(action: IdleAction, code: number, opts: { pick?: number[]; decline?: number[]; desc?: RegExp; from?: string } = {}) {
    const p = this.idle;
    const list = this.list(action);
    const index = list.findIndex((c) => c.code === code && (!opts.from || c.location === opts.from)
      && (!opts.desc || opts.desc.test((c as EngineEffectRef).desc ?? "")));
    expect(index, `${action} ${code} should be offered; offered: ${JSON.stringify(list.map((c) => [c.code, c.location, (c as EngineEffectRef).desc]))}`).toBeGreaterThanOrEqual(0);
    this.pick = opts.pick ?? [];
    this.decline = opts.decline ?? [];
    this.lastEvents = [];
    await this.answer({ promptId: p.id, kind: "idle", action, index });
    await this.settle();
  }

  /** End my turn; the opponent passes its turn; back to my Main Phase 1. */
  async endTurn() {
    const p = this.idle;
    await this.answer({ promptId: p.id, kind: "idle", action: "end" });
    await this.settle();
  }

  private async answer(r: EngineResponse) {
    const p = this.duel.prompt!;
    if (process.env.COMBO_DEBUG) this.trace.push(`PROMPT seat${p.player} ${JSON.stringify(p).slice(0, 600)} -> ${JSON.stringify(r)}`);
    const events = await this.duel.respond(p.player, r);
    this.lastEvents.push(...events);
    for (const e of events) this.trace.push(JSON.stringify(e).slice(0, 200));
    expect(this.duel.retries, `engine rejected ${JSON.stringify(r)} for ${p.kind}`).toBe(0);
  }

  /** Answer prompts until it's my Main Phase again. */
  async settle() {
    for (let i = 0; i < 300; i++) {
      const p = this.duel.prompt as EnginePrompt | null;
      if (!p || this.duel.finished) return;
      if (p.kind === "idle" && p.player === 0) return;
      await this.answer(this.respond(p));
    }
    throw new Error("prompts never settled");
  }

  private prefer<T extends { code: number }>(cards: T[]): number[] {
    const order = cards.map((c, i) => ({ i, k: this.pick.indexOf(c.code) })).filter((x) => x.k >= 0).sort((a, b) => a.k - b.k);
    const used = new Map<number, number>(), out: number[] = [];
    for (const { i } of order) {
      const code = cards[i].code, n = this.pick.filter((x) => x === code).length;
      if ((used.get(code) ?? 0) < n) { out.push(i); used.set(code, (used.get(code) ?? 0) + 1); }
    }
    return out;
  }

  private respond(p: EnginePrompt): EngineResponse {
    const id = p.id;
    if (p.player === 1) {
      if (p.kind === "selectChain" && !p.forced) return { promptId: id, kind: "selectChain", index: null };
      if (p.kind === "effectYesNo" || p.kind === "yesNo") return { promptId: id, kind: p.kind, yes: false };
      if (p.kind === "idle") return { promptId: id, kind: "idle", action: "end" };
      if (p.kind === "battle") return { promptId: id, kind: "battle", action: "end" };
      return botResponse(p, this.rng);
    }
    switch (p.kind) {
      case "effectYesNo": return { promptId: id, kind: p.kind, yes: !this.decline.includes(p.card.code) };
      case "yesNo": return { promptId: id, kind: p.kind, yes: true };
      case "selectChain": {
        const i = p.cards.findIndex((c) => this.chainCodes.includes(c.code) && !this.decline.includes(c.code));
        return { promptId: id, kind: "selectChain", index: p.forced ? Math.max(0, i) : i >= 0 ? i : null };
      }
      case "selectCard": case "selectTribute": {
        const want = this.prefer(p.cards).slice(0, p.max);
        for (let i = 0; want.length < p.min && i < p.cards.length; i++) if (!want.includes(i)) want.push(i);
        return { promptId: id, kind: p.kind, indices: want };
      }
      case "selectUnselect": {
        // (`max` is for this step: the core counts what's already selected separately)
        const want = this.prefer(p.cards);
        if (want.length) return { promptId: id, kind: "selectUnselect", index: want[0] };
        if (p.canFinish && p.selected.length >= p.min) return { promptId: id, kind: "selectUnselect", index: null };
        return { promptId: id, kind: "selectUnselect", index: 0 };
      }
      case "selectSum": {
        const want = this.prefer(p.cards);
        return want.length ? { promptId: id, kind: "selectSum", indices: want } : botResponse(p, this.rng);
      }
      case "selectPosition":
        return { promptId: id, kind: "selectPosition", position: p.positions.includes("atk") ? "atk" : p.positions[0] };
      case "option":
        return { promptId: id, kind: "option", index: 0 };
      default:
        return botResponse(p, this.rng);
    }
  }

  /** Current ATK / Level of my face-up monster `code` on the field, straight from the core. */
  stat(code: number, seat: 0 | 1 = 0): { atk: number; level: number } {
    const d = this.duel as unknown as { core: { duelQueryLocation(h: unknown, q: unknown): ({ code?: number; attack?: number; level?: number } | null)[] }; handle: unknown };
    const cards = d.core.duelQueryLocation(d.handle, { flags: OcgQueryFlags.CODE | OcgQueryFlags.ATTACK | OcgQueryFlags.LEVEL, controller: this.duel.ctx.teamOf(seat), location: OcgLocation.MZONE });
    const c = cards.find((x) => x?.code === code);
    if (!c) throw new Error(`${code} not on seat ${seat}'s field`);
    return { atk: c.attack ?? -1, level: c.level ?? -1 };
  }
  atk(code: number) { return this.stat(code).atk; }
}
