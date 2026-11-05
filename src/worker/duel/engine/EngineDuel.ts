// One rules-enforced duel on top of the sync ocgcore build.
//
// The core's state lives in WASM memory, which does not survive Durable Object eviction or
// hibernation. A duel is therefore *defined* by `SavedDuel` (seed + decks + every response
// so far): `EngineDuel.restore()` rebuilds it by replaying the responses, which the core
// processes deterministically. The same replay covers a script that was not preloaded:
// the sync core can't wait for D1, so we note what it asked for, fetch it, and rebuild.

import {
  OcgDuelMode, OcgHintType, OcgLocation, OcgMessageType, OcgPosition, OcgProcessResult, OcgQueryFlags, OcgResponseType,
  type OcgCoreSync, type OcgMessage, type OcgResponse,
} from "ocgcore-wasm";
import type { BoardState, CardInstance, PlayerBoard } from "../../../shared/duel.ts";
import { HIDDEN_CODE } from "../../../shared/duel.ts";
import type {
  EngineCardRef, EngineEvent, EnginePhase, EnginePrompt, EngineResponse, EngineStatus, Seat,
} from "../../../shared/enginePrompts.ts";
import type { EngineData } from "./data.ts";
import { BadResponse, decodeEvents, decodePrompt, encodeResponse, isFaceUp, phaseName, posName, promptTeam, type DecodeCtx } from "./decode.ts";
import { hintText } from "./strings.ts";

export interface DeckCodes { main: number[]; extra: number[] }

export interface DuelSetup {
  /** 4 x u64 as decimal strings (JSON-safe). */
  seed: [string, string, string, string];
  /** Indexed by seat. */
  decks: [DeckCodes, DeckCodes];
  names?: [string, string];
  /** Seat that takes the first turn. */
  first: Seat;
  startingLP?: number;
  startingHand?: number;
  drawPerTurn?: number;
}

/** Everything needed to rebuild the duel; store this (it is plain JSON). */
export interface SavedDuel {
  setup: DuelSetup;
  responses: OcgResponse[];
}

export function randomSeed(): DuelSetup["seed"] {
  const v = new BigUint64Array(4);
  crypto.getRandomValues(v);
  return [v[0].toString(), v[1].toString(), v[2].toString(), v[3].toString()];
}

const MAX_REBUILDS = 8;

export class EngineDuel {
  private handle: ReturnType<OcgCoreSync["createDuel"]> = null;
  private replayPos = 0;
  private pendingHint: string | undefined;
  private lastSelect: OcgMessage | null = null;
  private turnPlayerTeam = 0;

  /** Events since the last response (what the room should broadcast after `respond`). */
  events: EngineEvent[] = [];
  prompt: EnginePrompt | null = null;
  status: EngineStatus;
  /** Messages the core rejected (MSG_RETRY) since the last good response. */
  retries = 0;
  /** Rebuild-by-replay count; > 0 means a script/card wasn't preloaded. */
  rebuilds = 0;
  readonly ctx: DecodeCtx;

  private constructor(private core: OcgCoreSync, private data: EngineData, readonly saved: SavedDuel) {
    const first = saved.setup.first;
    this.ctx = {
      seatOf: (team) => ((team ^ first) & 1) as Seat,
      teamOf: (seat) => (seat ^ first) & 1,
      desc: (d) => this.describe(d),
    };
    this.status = this.freshStatus();
  }

  /** New duel. */
  static async create(core: OcgCoreSync, data: EngineData, setup: DuelSetup): Promise<EngineDuel> {
    return EngineDuel.restore(core, data, { setup, responses: [] });
  }

  /** Rebuild a duel from its saved form (after hibernation, or to change hosts). */
  static async restore(core: OcgCoreSync, data: EngineData, saved: SavedDuel): Promise<EngineDuel> {
    const d = new EngineDuel(core, data, { setup: saved.setup, responses: [...saved.responses] });
    const s = saved.setup;
    await data.preload([...s.decks[0].main, ...s.decks[0].extra, ...s.decks[1].main, ...s.decks[1].extra]);
    await d.rebuild();
    return d;
  }

  get finished(): boolean { return this.status.finished; }

  /** Card name from engine_cards (BabelCDB), for log lines. */
  cardName(code: number): string | null { return this.data.row(code)?.name || null; }

  /** Answer the current prompt. Throws BadResponse for an invalid answer (state unchanged). */
  async respond(seat: Seat, res: EngineResponse): Promise<EngineEvent[]> {
    const p = this.prompt;
    if (!p || this.finished) throw new BadResponse("nothing to answer");
    if (p.player !== seat) throw new BadResponse("not your choice");
    if (res.promptId !== p.id) throw new BadResponse("that prompt has expired");
    const ocg = encodeResponse(this.ctx, p, res);
    this.saved.responses.push(ocg);
    this.replayPos++;
    this.events = [];
    this.prompt = null;
    this.core.duelSetResponse(this.handle!, ocg);
    this.retries = 0;
    this.run();
    if (this.data.hasMissing() && await this.data.fetchMissing()) {
      this.rebuilds++;
      await this.rebuild();
    }
    return this.events;
  }

  destroy(): void {
    if (this.handle) this.core.destroyDuel(this.handle);
    this.handle = null;
  }

  // -------------------------------------------------------------------------------------

  private freshStatus(): EngineStatus {
    const lp = this.saved.setup.startingLP ?? 8000;
    return { turn: 0, turnPlayer: this.saved.setup.first, phase: "draw", lp: [lp, lp], finished: false, winner: null, waitingFor: null };
  }

  /** (Re)create the core duel and replay every saved response. */
  private async rebuild(): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      this.destroy();
      this.status = this.freshStatus();
      this.prompt = null; this.lastSelect = null; this.pendingHint = undefined;
      this.replayPos = 0; this.events = [];
      this.createCoreDuel();
      this.run();
      if (!this.data.hasMissing()) return;
      if (attempt >= MAX_REBUILDS || !(await this.data.fetchMissing())) return;
      this.rebuilds++;
    }
  }

  private createCoreDuel(): void {
    const s = this.saved.setup;
    const team = { startingLP: s.startingLP ?? 8000, startingDrawCount: s.startingHand ?? 5, drawCountPerTurn: s.drawPerTurn ?? 1 };
    const h = this.core.createDuel({
      flags: OcgDuelMode.MODE_MR5,
      seed: s.seed.map((x) => BigInt(x)) as [bigint, bigint, bigint, bigint],
      team1: team, team2: team,
      cardReader: (code) => this.data.card(code),
      scriptReader: (name) => this.data.script(name),
      errorHandler: (_type, text) => { if (!/^\s*$/.test(text)) console.warn("[ocgcore]", text); },
    });
    if (!h) throw new Error("ocgcore: createDuel failed");
    this.handle = h;
    for (const name of ["constant.lua", "utility.lua"]) {
      const body = this.data.script(name);
      if (body === null) throw new Error(`engine script ${name} is missing (run scripts/import-engine-data.ts)`);
      this.core.loadScript(h, name, body);
    }
    for (const seat of [0, 1] as const) {
      const t = this.ctx.teamOf(seat) as 0 | 1;
      const add = (code: number, location: number) => this.core.duelNewCard(h, {
        team: t, duelist: 0, code: this.data.canonical(code), controller: t, location: location as never, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE as never,
      });
      for (const c of s.decks[seat].main) add(c, OcgLocation.DECK);
      for (const c of s.decks[seat].extra) add(c, OcgLocation.EXTRA);
    }
    this.core.startDuel(h);
  }

  /** Step the core until it needs an answer we don't have, or the duel ends. */
  private run(): void {
    const h = this.handle!;
    for (let guard = 0; guard < 100_000; guard++) {
      const result = this.core.duelProcess(h);
      for (const m of this.core.duelGetMessage(h)) this.onMessage(m);
      if (result === OcgProcessResult.END || this.status.finished) {
        this.prompt = null; this.status.waitingFor = null;
        return;
      }
      if (result === OcgProcessResult.WAITING) {
        if (this.replayPos < this.saved.responses.length) {
          this.core.duelSetResponse(h, this.saved.responses[this.replayPos++]);
          this.events = [];
          continue;
        }
        if (this.autoAnswer()) continue;
        return;
      }
    }
    throw new Error("ocgcore: duel did not settle");
  }

  /**
   * Answer prompts that offer no real choice, like EDOPro's client does: a chain window with
   * nothing to chain. These answers are logged like any other so replay stays exact.
   */
  private autoAnswer(): boolean {
    const p = this.prompt;
    if (!p || p.kind !== "selectChain" || p.forced || p.cards.length) return false;
    const ocg: OcgResponse = { type: OcgResponseType.SELECT_CHAIN, index: null };
    this.saved.responses.push(ocg);
    this.replayPos++;
    this.prompt = null;
    this.core.duelSetResponse(this.handle!, ocg);
    return true;
  }

  private onMessage(m: OcgMessage): void {
    const st = this.status, ctx = this.ctx;
    switch (m.type) {
      case OcgMessageType.RETRY:
        this.retries++;
        // The core listed a choice whose activation then failed its own checks (cost, zones...):
        // it asks again, so tell the player why the same question came back.
        this.pendingHint = "That choice can't be made right now. Choose again.";
        if (this.lastSelect) this.setPrompt(this.lastSelect);
        return;
      case OcgMessageType.HINT:
        if (m.hint_type === OcgHintType.SELECTMSG) this.pendingHint = hintText(Number(m.hint), (d) => this.describe(d), (c) => this.cardName(c));
        else if (m.hint_type === OcgHintType.MESSAGE || m.hint_type === OcgHintType.EVENT) {
          this.events.push({ e: "hint", player: ctx.seatOf(m.player), text: hintText(Number(m.hint), (d) => this.describe(d), (c) => this.cardName(c)) });
        }
        return;
      case OcgMessageType.NEW_TURN:
        st.turn++; this.turnPlayerTeam = m.player; st.turnPlayer = ctx.seatOf(m.player);
        this.events.push({ e: "turn", player: st.turnPlayer, turn: st.turn });
        return;
      case OcgMessageType.NEW_PHASE: {
        const p = phaseName(m.phase);
        st.phase = p.phase;
        this.events.push({ e: "phase", ...p });
        return;
      }
      case OcgMessageType.DAMAGE: case OcgMessageType.RECOVER: case OcgMessageType.PAY_LPCOST: case OcgMessageType.LPUPDATE: {
        const seat = ctx.seatOf(m.player);
        const before = st.lp[seat];
        const after = m.type === OcgMessageType.LPUPDATE ? m.lp
          : m.type === OcgMessageType.RECOVER ? before + m.amount : Math.max(0, before - m.amount);
        st.lp[seat] = after;
        const cause = m.type === OcgMessageType.DAMAGE ? "damage" : m.type === OcgMessageType.RECOVER ? "recover" : m.type === OcgMessageType.PAY_LPCOST ? "cost" : "set";
        this.events.push({ e: "lp", player: seat, lp: after, delta: after - before, cause });
        return;
      }
      case OcgMessageType.WIN: {
        st.finished = true;
        st.winner = m.player > 1 ? null : ctx.seatOf(m.player);   // 2 = draw
        st.waitingFor = null;
        this.events.push({ e: "win", winner: st.winner, reason: m.reason });
        return;
      }
    }
    const body = decodePrompt(ctx, m);
    if (body) { this.lastSelect = m; this.setPrompt(m); return; }
    this.events.push(...decodeEvents(ctx, m));
  }

  private setPrompt(m: OcgMessage): void {
    const body = decodePrompt(this.ctx, m)!;
    const player = this.ctx.seatOf(promptTeam(m));
    this.prompt = { ...body, id: this.saved.responses.length, player, ...(this.pendingHint ? { hint: this.pendingHint } : {}) } as EnginePrompt;
    this.pendingHint = undefined;
    this.status.waitingFor = player;
  }

  private describe(d: bigint): string {
    if (d === 0n) return "";
    const code = Number(d >> 20n), idx = Number(d & 0xfffffn);
    if (code > 0) {
      const row = this.data.row(code);
      return row?.strings[idx] || (row ? `${row.name} (effect ${idx + 1})` : `card ${code} effect ${idx + 1}`);
    }
    return hintText(idx, () => "");
  }

  // -------------------------------------------------------------------------------------
  // state export

  /**
   * The board as the shared `BoardState`. `viewer` masks hidden cards (code 0) the way the
   * room sends state to a player; pass null for the full state (e.g. switching to manual).
   */
  toBoardState(viewer: Seat | null): BoardState {
    const h = this.handle!;
    const flags = (OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.OVERLAY_CARD | OcgQueryFlags.COUNTERS | OcgQueryFlags.OWNER) as never;
    const names = this.saved.setup.names ?? ["Player 1", "Player 2"];
    const extraMonster: (CardInstance | null)[] = [null, null];
    const players = ([0, 1] as const).map((seat): PlayerBoard => {
      const team = this.ctx.teamOf(seat) as 0 | 1;
      const q = (location: number) => this.core.duelQueryLocation(h, { flags, controller: team, location: location as never });
      const make = (info: ReturnType<typeof q>[number], location: number, seq: number): CardInstance | null => {
        if (!info || !info.code) return null;
        const pos = info.position ?? OcgPosition.FACEDOWN_DEFENSE;
        const faceUp = location === OcgLocation.GRAVE || (location !== OcgLocation.DECK && location !== OcgLocation.HAND && isFaceUp(pos));
        const visible = viewer === null ? true
          : location === OcgLocation.HAND ? viewer === seat
          : location === OcgLocation.DECK ? false
          : faceUp || viewer === seat;
        const owner = (info.owner !== undefined ? this.ctx.seatOf(info.owner) : seat) as 0 | 1;
        const card: CardInstance = { uid: `e${seat}-${location}-${seq}`, code: visible ? info.code : HIDDEN_CODE, owner, faceUp };
        const p = posName(pos, location);
        if (p) card.position = p;
        if (info.counters && Object.keys(info.counters).length) {
          card.counters = Object.fromEntries(Object.entries(info.counters).map(([k, v]) => [`0x${Number(k).toString(16)}`, v]));
        }
        if (info.overlayCards?.length) {
          card.materials = info.overlayCards.map((code, i) => ({ uid: `${card.uid}-m${i}`, code, owner, faceUp: true }));
        }
        return card;
      };
      const list = (location: number) => q(location).map((c, i) => make(c, location, i)).filter((c): c is CardInstance => !!c);
      const mz = q(OcgLocation.MZONE), sz = q(OcgLocation.SZONE);
      const monster = [0, 1, 2, 3, 4].map((i) => make(mz[i], OcgLocation.MZONE, i));
      // Extra Monster Zones are shared: team 0's seq 5 is the left one from team 0's side.
      for (const s of [5, 6]) {
        const c = make(mz[s], OcgLocation.MZONE, s);
        if (c) extraMonster[team === 0 ? s - 5 : 6 - s] = c;
      }
      return {
        name: names[seat],
        lp: this.status.lp[seat],
        deck: list(OcgLocation.DECK).reverse(),   // core: last = top; BoardState: index 0 = top
        hand: list(OcgLocation.HAND),
        extra: list(OcgLocation.EXTRA),
        gy: list(OcgLocation.GRAVE).reverse(),
        banished: list(OcgLocation.REMOVED),
        monster,
        spelltrap: [0, 1, 2, 3, 4].map((i) => make(sz[i], OcgLocation.SZONE, i)),
        field: make(sz[5], OcgLocation.SZONE, 5),
        // Master Rule 5: Pendulum Zones are the outer S/T zones, already in `spelltrap`.
        pendulum: [null, null],
      };
    }) as [PlayerBoard, PlayerBoard];
    return {
      players, extraMonster,
      turn: Math.max(1, this.status.turn), turnPlayer: this.status.turnPlayer, phase: this.status.phase as EnginePhase,
      log: [],
    };
  }
}

// ---------------------------------------------------------------------------------------
// per-viewer masking of events

function visibleRef(c: EngineCardRef, viewer: Seat): boolean {
  switch (c.location) {
    case "gy": case "overlay": case "banished": return true;   // (face-down banishment is rare; not tracked)
    case "deck": return false;
    case "hand": case "extra": return c.controller === viewer;
    default: return c.position !== "faceDown" && c.position !== "faceDownDef" || c.controller === viewer;
  }
}
const mask = (c: EngineCardRef, v: Seat): EngineCardRef => (visibleRef(c, v) ? c : { ...c, code: HIDDEN_CODE });

/** Strip what `viewer` may not see. Prompts are only ever sent to their own player. */
export function eventsFor(events: EngineEvent[], viewer: Seat): EngineEvent[] {
  return events.map((ev): EngineEvent => {
    switch (ev.e) {
      case "draw": return ev.player === viewer ? ev : { ...ev, codes: ev.codes.map(() => HIDDEN_CODE) };
      case "move": {
        const seen = (ev.to && visibleRef(ev.to, viewer)) || (ev.from && ev.from.location !== "hand" && ev.from.location !== "deck" && visibleRef(ev.from, viewer));
        return seen ? ev : { ...ev, code: HIDDEN_CODE, from: ev.from && { ...ev.from, code: HIDDEN_CODE }, to: ev.to && { ...ev.to, code: HIDDEN_CODE } };
      }
      case "set": return { ...ev, card: mask(ev.card, viewer) };
      case "reposition": return { ...ev, card: mask(ev.card, viewer) };
      case "summon": return ev;
      case "confirm": return ev;   // confirming = revealing to the opponent
      case "target": return { ...ev, cards: ev.cards.map((c) => mask(c, viewer)) };
      default: return ev;
    }
  });
}
