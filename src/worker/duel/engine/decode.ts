// Core message <-> shared prompt/event/response conversion. `seatOf(team)` maps the core's
// team numbers (team 0 always goes first) to room seats.

import {
  OcgLocation, OcgMessageType, OcgPhase, OcgPosition, OcgResponseType,
  SelectBattleCMDAction, SelectIdleCMDAction,
  type OcgMessage, type OcgResponse, type OcgLocPos, type OcgCardLoc,
} from "ocgcore-wasm";
import type { Position } from "../../../shared/duel.ts";
import type {
  EngineCardRef, EngineEffectRef, EngineEvent, EngineLocation, EnginePhase, EnginePlace,
  EnginePrompt, EngineResponse, Seat,
} from "../../../shared/enginePrompts.ts";

export interface DecodeCtx {
  seatOf(team: number): Seat;
  teamOf(seat: Seat): number;
  /** Resolve an effect description (card code << 20 | string index, or a system string id). */
  desc(d: bigint): string;
}

// ---------------------------------------------------------------------------------------
// locations / positions

export function locName(location: number, sequence: number): EngineLocation {
  if (location & OcgLocation.OVERLAY) return "overlay";
  switch (location) {
    case OcgLocation.DECK: return "deck";
    case OcgLocation.HAND: return "hand";
    case OcgLocation.MZONE: return "monster";
    case OcgLocation.SZONE: return sequence === 5 ? "field" : sequence >= 6 ? "pendulum" : "spelltrap";
    case OcgLocation.GRAVE: return "gy";
    case OcgLocation.REMOVED: return "banished";
    case OcgLocation.EXTRA: return "extra";
    case OcgLocation.FZONE: return "field";
    case OcgLocation.PZONE: return "pendulum";
    default: return "deck";
  }
}

export function posName(pos: number, location: number): Position | undefined {
  const st = location === OcgLocation.SZONE || location === OcgLocation.FZONE || location === OcgLocation.PZONE;
  if (st) return pos & OcgPosition.FACEDOWN ? "faceDown" : undefined;
  if (location !== OcgLocation.MZONE) return undefined;
  if (pos & OcgPosition.FACEUP_ATTACK) return "atk";
  if (pos & OcgPosition.FACEUP_DEFENSE) return "def";
  return "faceDownDef";
}
export function posValue(p: Position): number {
  return p === "atk" ? OcgPosition.FACEUP_ATTACK
    : p === "def" ? OcgPosition.FACEUP_DEFENSE
    : p === "faceDownDef" ? OcgPosition.FACEDOWN_DEFENSE
    : OcgPosition.FACEDOWN_ATTACK;
}
export function isFaceUp(pos: number): boolean { return (pos & OcgPosition.FACEUP) !== 0; }

type AnyLoc = Partial<OcgLocPos> & Pick<OcgCardLoc, "controller" | "location" | "sequence"> & { code?: number };

export function ref(ctx: DecodeCtx, c: AnyLoc, code = c.code ?? 0): EngineCardRef {
  const r: EngineCardRef = { code, controller: ctx.seatOf(c.controller), location: locName(c.location, c.sequence), sequence: c.sequence };
  if (c.position !== undefined) { const p = posName(c.position, c.location); if (p) r.position = p; }
  if (c.location & OcgLocation.OVERLAY) r.overlay = c.overlay_sequence ?? 0;
  return r;
}
function effRef(ctx: DecodeCtx, c: AnyLoc & { description: bigint }): EngineEffectRef {
  return { ...ref(ctx, c), desc: ctx.desc(c.description) };
}

/** Decode a SELECT_PLACE field mask (set bits = unavailable), from `team`'s point of view. */
export function placesFromMask(ctx: DecodeCtx, team: number, mask: number): EnginePlace[] {
  const out: EnginePlace[] = [];
  for (const [side, shift] of [[team, 0], [1 - team, 16]] as const) {
    const controller = ctx.seatOf(side);
    for (let s = 0; s < 7; s++) if (!(mask & (1 << (shift + s)))) out.push({ controller, location: "monster", sequence: s });
    for (let s = 0; s < 5; s++) if (!(mask & (1 << (shift + 8 + s)))) out.push({ controller, location: "spelltrap", sequence: s });
    if (!(mask & (1 << (shift + 13)))) out.push({ controller, location: "field", sequence: 5 });
    for (let s = 0; s < 2; s++) if (!(mask & (1 << (shift + 14 + s)))) out.push({ controller, location: "pendulum", sequence: s });
  }
  return out;
}
function placeToOcg(ctx: DecodeCtx, p: EnginePlace) {
  const player = ctx.teamOf(p.controller);
  switch (p.location) {
    case "monster": return { player, location: OcgLocation.MZONE, sequence: p.sequence };
    case "spelltrap": return { player, location: OcgLocation.SZONE, sequence: p.sequence };
    case "field": return { player, location: OcgLocation.SZONE, sequence: 5 };
    case "pendulum": return { player, location: OcgLocation.PZONE, sequence: p.sequence };
  }
}

// "faceDown" here means face-down Attack Position (only a few old cards use it)
const POSITIONS: Position[] = ["atk", "faceDown", "def", "faceDownDef"];
const POSITION_BITS = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEDOWN_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE];

export function phaseName(p: number): { phase: EnginePhase; step?: "start" | "battleStep" | "damage" | "damageCalc" } {
  switch (p) {
    case OcgPhase.DRAW: return { phase: "draw" };
    case OcgPhase.STANDBY: return { phase: "standby" };
    case OcgPhase.MAIN1: return { phase: "main1" };
    case OcgPhase.BATTLE_START: return { phase: "battle", step: "start" };
    case OcgPhase.BATTLE_STEP: return { phase: "battle", step: "battleStep" };
    case OcgPhase.DAMAGE: return { phase: "battle", step: "damage" };
    case OcgPhase.DAMAGE_CAL: return { phase: "battle", step: "damageCalc" };
    case OcgPhase.BATTLE: return { phase: "battle" };
    case OcgPhase.MAIN2: return { phase: "main2" };
    default: return { phase: "end" };
  }
}

function bits(v: number | bigint): number[] {
  const out: number[] = [];
  let x = BigInt(v);
  for (let b = 0n; x > 0n; b++, x >>= 1n) if (x & 1n) out.push(Number(1n << b));
  return out;
}

// ---------------------------------------------------------------------------------------
// prompts

type PromptBody = EnginePrompt extends infer P ? P extends unknown ? Omit<P, "id" | "player" | "hint"> : never : never;

/** Returns the prompt body for a select-type message, or null for informational messages. */
export function decodePrompt(ctx: DecodeCtx, m: OcgMessage): PromptBody | null {
  const r = (c: AnyLoc) => ref(ctx, c);
  switch (m.type) {
    case OcgMessageType.SELECT_IDLECMD:
      return {
        kind: "idle", summons: m.summons.map(r), specialSummons: m.special_summons.map(r),
        repositions: m.pos_changes.map(r), monsterSets: m.monster_sets.map(r), spellSets: m.spell_sets.map(r),
        activates: m.activates.map((c) => effRef(ctx, c)), canBattle: m.to_bp, canEnd: m.to_ep, canShuffle: m.shuffle,
      };
    case OcgMessageType.SELECT_BATTLECMD:
      return {
        kind: "battle", activates: m.chains.map((c) => effRef(ctx, c)),
        attacks: m.attacks.map((c) => ({ ...r(c), direct: c.can_direct })), canMain2: m.to_m2, canEnd: m.to_ep,
      };
    case OcgMessageType.SELECT_EFFECTYN:
      return { kind: "effectYesNo", card: r(m), desc: ctx.desc(m.description) };
    case OcgMessageType.SELECT_YESNO:
      return { kind: "yesNo", desc: ctx.desc(m.description) };
    case OcgMessageType.SELECT_OPTION:
      return { kind: "option", options: m.options.map((o) => ctx.desc(o)) };
    case OcgMessageType.SELECT_CARD:
      return { kind: "selectCard", min: m.min, max: m.max, canCancel: m.can_cancel, cards: m.selects.map(r) };
    case OcgMessageType.SELECT_UNSELECT_CARD:
      return {
        kind: "selectUnselect", min: m.min, max: m.max, canFinish: m.can_finish, canCancel: m.can_cancel,
        cards: m.select_cards.map(r), selected: m.unselect_cards.map(r),
      };
    case OcgMessageType.SELECT_CHAIN:
      return { kind: "selectChain", forced: m.forced, cards: m.selects.map((c) => effRef(ctx, c)) };
    case OcgMessageType.SELECT_PLACE:
    case OcgMessageType.SELECT_DISFIELD:
      return {
        kind: "selectPlace", count: m.count, places: placesFromMask(ctx, m.player, m.field_mask),
        disabling: m.type === OcgMessageType.SELECT_DISFIELD,
      };
    case OcgMessageType.SELECT_POSITION:
      return { kind: "selectPosition", code: m.code, positions: POSITIONS.filter((_, i) => m.positions & POSITION_BITS[i]) };
    case OcgMessageType.SELECT_TRIBUTE:
      return {
        kind: "selectTribute", min: m.min, max: m.max, canCancel: m.can_cancel,
        cards: m.selects.map((c) => ({ ...r(c), value: c.release_param })),
      };
    case OcgMessageType.SELECT_SUM:
      return {
        kind: "selectSum", target: m.amount, exact: m.select_max === 0, min: m.min, max: m.max,
        must: m.selects_must.map((c) => ({ ...r(c), value: c.amount })),
        cards: m.selects.map((c) => ({ ...r(c), value: c.amount })),
      };
    case OcgMessageType.SELECT_COUNTER:
      return { kind: "selectCounter", counterType: m.counter_type, count: m.count, cards: m.cards.map((c) => ({ ...r(c), available: c.count })) };
    case OcgMessageType.SORT_CARD:
    case OcgMessageType.SORT_CHAIN:
      return { kind: "sort", chain: m.type === OcgMessageType.SORT_CHAIN, cards: m.cards.map(r) };
    case OcgMessageType.ROCK_PAPER_SCISSORS:
      return { kind: "rps" };
    case OcgMessageType.ANNOUNCE_NUMBER:
      return { kind: "announceNumber", options: m.options.map(Number) };
    case OcgMessageType.ANNOUNCE_RACE:
      return { kind: "announceRace", count: m.count, available: bits(m.available) };
    case OcgMessageType.ANNOUNCE_ATTRIB:
      return { kind: "announceAttribute", count: m.count, available: bits(m.available) };
    case OcgMessageType.ANNOUNCE_CARD:
      return { kind: "announceCard" };
    default:
      return null;
  }
}

/** Which player a select message is addressed to (core team number). */
export function promptTeam(m: OcgMessage): number {
  return "player" in m ? (m as { player: number }).player : 0;
}

// ---------------------------------------------------------------------------------------
// responses

export class BadResponse extends Error {}

export function encodeResponse(ctx: DecodeCtx, p: EnginePrompt, res: EngineResponse): OcgResponse {
  if (res.kind !== p.kind && !(p.kind === "effectYesNo" && res.kind === "yesNo")) {
    throw new BadResponse(`expected a ${p.kind} response`);
  }
  const inRange = (i: number, n: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= n) throw new BadResponse("choice out of range");
    return i;
  };
  const indexList = (ix: number[], n: number, min: number, max: number) => {
    if (!Array.isArray(ix) || new Set(ix).size !== ix.length) throw new BadResponse("bad selection");
    ix.forEach((i) => inRange(i, n));
    if (ix.length < min || ix.length > max) throw new BadResponse(`select between ${min} and ${max}`);
    return ix;
  };
  switch (res.kind) {
    case "idle": {
      if (p.kind !== "idle") break;
      const lists = { summon: p.summons, specialSummon: p.specialSummons, reposition: p.repositions, monsterSet: p.monsterSets, spellSet: p.spellSets, activate: p.activates } as const;
      const acts = {
        summon: SelectIdleCMDAction.SELECT_SUMMON, specialSummon: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON,
        reposition: SelectIdleCMDAction.SELECT_POS_CHANGE, monsterSet: SelectIdleCMDAction.SELECT_MONSTER_SET,
        spellSet: SelectIdleCMDAction.SELECT_SPELL_SET, activate: SelectIdleCMDAction.SELECT_ACTIVATE,
        battle: SelectIdleCMDAction.TO_BP, end: SelectIdleCMDAction.TO_EP, shuffle: SelectIdleCMDAction.SHUFFLE,
      } as const;
      if (res.action === "battle" && !p.canBattle || res.action === "end" && !p.canEnd || res.action === "shuffle" && !p.canShuffle) {
        throw new BadResponse(`can't ${res.action} now`);
      }
      const index = "index" in res ? inRange(res.index, lists[res.action].length) : null;
      return { type: OcgResponseType.SELECT_IDLECMD, action: acts[res.action], index };
    }
    case "battle": {
      if (p.kind !== "battle") break;
      if (res.action === "main2" && !p.canMain2 || res.action === "end" && !p.canEnd) throw new BadResponse(`can't ${res.action} now`);
      const acts = { activate: SelectBattleCMDAction.SELECT_CHAIN, attack: SelectBattleCMDAction.SELECT_BATTLE, main2: SelectBattleCMDAction.TO_M2, end: SelectBattleCMDAction.TO_EP } as const;
      const index = "index" in res ? inRange(res.index, (res.action === "attack" ? p.attacks : p.activates).length) : null;
      return { type: OcgResponseType.SELECT_BATTLECMD, action: acts[res.action], index };
    }
    case "effectYesNo":
    case "yesNo":
      return p.kind === "effectYesNo"
        ? { type: OcgResponseType.SELECT_EFFECTYN, yes: !!res.yes }
        : { type: OcgResponseType.SELECT_YESNO, yes: !!res.yes };
    case "option":
      if (p.kind !== "option") break;
      return { type: OcgResponseType.SELECT_OPTION, index: inRange(res.index, p.options.length) };
    case "selectCard":
    case "selectTribute": {
      if (p.kind !== "selectCard" && p.kind !== "selectTribute") break;
      if (res.indices === null) {
        if (!p.canCancel) throw new BadResponse("this selection can't be cancelled");
        return { type: p.kind === "selectCard" ? OcgResponseType.SELECT_CARD : OcgResponseType.SELECT_TRIBUTE, indicies: null };
      }
      // tribute min/max count monsters by their release value, so only check the card range there
      const ix = p.kind === "selectCard" ? indexList(res.indices, p.cards.length, p.min, p.max) : indexList(res.indices, p.cards.length, 1, p.cards.length);
      return { type: p.kind === "selectCard" ? OcgResponseType.SELECT_CARD : OcgResponseType.SELECT_TRIBUTE, indicies: ix };
    }
    case "selectUnselect":
      if (p.kind !== "selectUnselect") break;
      if (res.index === null) {
        if (!p.canFinish && !p.canCancel) throw new BadResponse("pick a card");
        return { type: OcgResponseType.SELECT_UNSELECT_CARD, index: null };
      }
      return { type: OcgResponseType.SELECT_UNSELECT_CARD, index: inRange(res.index, p.cards.length + p.selected.length) };
    case "selectChain":
      if (p.kind !== "selectChain") break;
      if (res.index === null && p.forced) throw new BadResponse("you must chain");
      return { type: OcgResponseType.SELECT_CHAIN, index: res.index === null ? null : inRange(res.index, p.cards.length) };
    case "selectPlace": {
      if (p.kind !== "selectPlace") break;
      const ok = (q: EnginePlace) => p.places.some((x) => x.controller === q.controller && x.location === q.location && x.sequence === q.sequence);
      if (!Array.isArray(res.places) || res.places.length !== p.count || !res.places.every(ok)) throw new BadResponse("pick an open zone");
      return { type: p.disabling ? OcgResponseType.SELECT_DISFIELD : OcgResponseType.SELECT_PLACE, places: res.places.map((q) => placeToOcg(ctx, q)) };
    }
    case "selectPosition":
      if (p.kind !== "selectPosition") break;
      if (!p.positions.includes(res.position)) throw new BadResponse("position not allowed");
      return { type: OcgResponseType.SELECT_POSITION, position: posValue(res.position) as never };
    case "selectSum": {
      if (p.kind !== "selectSum") break;
      const ix = indexList(res.indices, p.cards.length, 0, p.cards.length);
      // the core indexes must-select cards first, then the optional ones
      return { type: OcgResponseType.SELECT_SUM, indicies: [...p.must.map((_, i) => i), ...ix.map((i) => p.must.length + i)] };
    }
    case "selectCounter":
      if (p.kind !== "selectCounter") break;
      if (!Array.isArray(res.counts) || res.counts.length !== p.cards.length) throw new BadResponse("one count per card");
      return { type: OcgResponseType.SELECT_COUNTER, counters: res.counts.map((n, i) => Math.max(0, Math.min(p.cards[i].available, n | 0))) };
    case "sort":
      if (p.kind !== "sort") break;
      return { type: OcgResponseType.SORT_CARD, order: res.order };
    case "rps":
      return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: ({ scissors: 1, rock: 2, paper: 3 } as const)[res.choice] ?? 2 };
    case "announceNumber":
      if (p.kind !== "announceNumber") break;
      return { type: OcgResponseType.ANNOUNCE_NUMBER, value: inRange(res.index, p.options.length) };
    case "announceRace":
      if (p.kind !== "announceRace") break;
      return { type: OcgResponseType.ANNOUNCE_RACE, races: res.values.map((v) => BigInt(v)) as never };
    case "announceAttribute":
      return { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: res.values as never };
    case "announceCard":
      return { type: OcgResponseType.ANNOUNCE_CARD, card: res.code | 0 };
  }
  throw new BadResponse("response doesn't match the prompt");
}

// ---------------------------------------------------------------------------------------
// events

export function decodeEvents(ctx: DecodeCtx, m: OcgMessage): EngineEvent[] {
  const r = (c: AnyLoc, code?: number) => ref(ctx, c, code);
  switch (m.type) {
    case OcgMessageType.START: return [{ e: "start" }];
    case OcgMessageType.DRAW: return [{ e: "draw", player: ctx.seatOf(m.player), codes: m.drawn.map((d) => d.code) }];
    case OcgMessageType.MOVE: {
      const from = m.from.location ? r(m.from, m.card) : null;
      const to = m.to.location ? r(m.to, m.card) : null;
      return [{ e: "move", code: m.card, from, to }];
    }
    case OcgMessageType.SUMMONING: return [{ e: "summon", how: "normal", card: r(m) }];
    case OcgMessageType.SPSUMMONING: return [{ e: "summon", how: "special", card: r(m) }];
    case OcgMessageType.FLIPSUMMONING: return [{ e: "summon", how: "flip", card: r(m) }];
    case OcgMessageType.SET: return [{ e: "set", card: r(m) }];
    case OcgMessageType.POS_CHANGE: return [{ e: "reposition", card: r(m) }];
    case OcgMessageType.CHAINING: return [{ e: "chain", link: m.chain_size, card: r(m), desc: ctx.desc(m.description) }];
    case OcgMessageType.CHAIN_SOLVING: return [{ e: "chainSolving", link: m.chain_size }];
    case OcgMessageType.CHAIN_SOLVED: return [{ e: "chainSolved", link: m.chain_size }];
    case OcgMessageType.CHAIN_NEGATED: return [{ e: "chainNegated", link: m.chain_size }];
    case OcgMessageType.CHAIN_DISABLED: return [{ e: "chainDisabled", link: m.chain_size }];
    case OcgMessageType.CHAIN_END: return [{ e: "chainEnd" }];
    case OcgMessageType.ATTACK: return [{ e: "attack", attacker: r(m.card), target: m.target ? r(m.target) : null }];
    case OcgMessageType.BATTLE: return [{ e: "battle", attacker: r(m.card), target: m.target ? r(m.target) : null }];
    case OcgMessageType.TOSS_COIN: return [{ e: "coin", player: ctx.seatOf(m.player), results: m.results }];
    case OcgMessageType.TOSS_DICE: return [{ e: "dice", player: ctx.seatOf(m.player), results: m.results }];
    case OcgMessageType.HAND_RES: {
      const [a, b] = m.results;   // indexed by team
      return [{ e: "rps", results: ctx.seatOf(0) === 0 ? [a, b] : [b, a] }];
    }
    case OcgMessageType.CONFIRM_CARDS:
    case OcgMessageType.CONFIRM_DECKTOP:
    case OcgMessageType.CONFIRM_EXTRATOP:
      return [{ e: "confirm", player: ctx.seatOf(m.player), cards: m.cards.map((c) => r(c)) }];
    case OcgMessageType.SHUFFLE_DECK: return [{ e: "shuffle", player: ctx.seatOf(m.player), where: "deck" }];
    case OcgMessageType.SHUFFLE_HAND: return [{ e: "shuffle", player: ctx.seatOf(m.player), where: "hand" }];
    case OcgMessageType.SHUFFLE_EXTRA: return [{ e: "shuffle", player: ctx.seatOf(m.player), where: "extra" }];
    case OcgMessageType.BECOME_TARGET: return [{ e: "target", cards: m.cards.map((c) => r(c)) }];
    default: return [];
  }
}
