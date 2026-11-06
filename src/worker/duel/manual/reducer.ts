// Manual-mode action reducer: (board, actor, action) -> new board + log + side effects.
// The server only checks ownership and zone occupancy; the players apply the game rules.

import { manualPhaseBlock } from "../../../shared/phases.ts";
import type { BoardState, CardInstance, DuelEvent, Position, Zone } from "../../../shared/duel.ts";
import { cardToken } from "../../../shared/duel.ts";
import {
  DEFAULT_TOKEN_CODE, PHASE_LABEL, isPileZone,
  type DuelAction, type MoveDest, type PileZone, type Seat,
} from "../../../shared/duelActions.ts";
import {
  SLOT_COUNT, controllerOf, findCard, firstFree, isOnField, isPublic, removeAt, settle, shuffleInPlace, slotArray, zoneOf,
  type Found, type Loc, type Rng,
} from "./board.ts";

export class ActionError extends Error {}

export interface ActionResult {
  board: BoardState;
  events: DuelEvent[];
  /** Private information for the acting player only (look at top N / deck search). */
  peek?: { title: string; cards: CardInstance[] };
  /** Set when the action ends the duel (LP reached 0, concede). winner null = draw. */
  finished?: { winner: Seat | null; reason: string };
}

export const MAX_LOG = 500;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const SRC_LABEL: Record<Zone | "material", string> = {
  deck: "the Deck", hand: "the hand", extra: "the Extra Deck", gy: "the GY", banished: "banishment",
  monster: "a Monster Zone", spelltrap: "a Spell & Trap Zone", field: "the Field Zone",
  extraMonster: "an Extra Monster Zone", pendulum: "a Pendulum Zone", material: "Xyz materials",
};

function label(card: CardInstance, visible: boolean): string {
  if (card.token) return card.code > 0 && visible ? `a ${cardToken(card.code)}` : "a Token";
  return visible ? cardToken(card.code) : "a card";
}

const posLabel = (p: Position | undefined) => (p === "def" ? "DEF" : p === "faceDownDef" ? "face-down DEF" : "ATK");

function need<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new ActionError(msg);
  return v;
}

function clampN(n: number | undefined, max = 60): number {
  const v = Math.floor(Number(n ?? 1));
  if (!Number.isFinite(v) || v < 1) throw new ActionError("Count must be at least 1.");
  return Math.min(v, max);
}

class Ctx {
  events: DuelEvent[] = [];
  peek?: ActionResult["peek"];
  finished?: ActionResult["finished"];
  constructor(public b: BoardState, public actor: Seat, public rng: Rng) {}
  name(p: Seat = this.actor) { return this.b.players[p].name; }
  log(line: string) { this.b.log.push(line); }

  find(uid: string): Found {
    if (typeof uid !== "string") throw new ActionError("Missing card.");
    return need(findCard(this.b, uid), "That card is no longer there.");
  }
  /** Find a card the actor controls. */
  own(uid: string): Found {
    const f = this.find(uid);
    if (controllerOf(this.b, f.loc) !== this.actor) throw new ActionError("That card is not under your control.");
    return f;
  }

  /**
   * Move a card to `dest`. Returns the label and both locations so callers can word the log.
   * Handles: deck-top/bottom, extra-deck redirect, tokens vanishing, materials falling off.
   */
  place(f: Found, dest: MoveDest): { what: string; to: Zone; toPlayer: Seat; slot?: number; vanished?: boolean; dropped: CardInstance[] } {
    const card = f.card;
    let zone = dest.zone;
    if (!zone) throw new ActionError("Missing destination.");
    const wasPublic = isPublic(card, f.loc);
    let toPlayer: Seat;
    let slot: number | undefined;

    if (isPileZone(zone)) {
      toPlayer = card.owner;
      if (zone === "deck" && card.extraDeck) zone = "extra";
    } else if (zone === "extraMonster") {
      toPlayer = dest.player ?? this.actor;
    } else if (zone === "monster" || zone === "spelltrap" || zone === "pendulum" || zone === "field") {
      toPlayer = dest.player ?? this.actor;
      if (toPlayer !== 0 && toPlayer !== 1) throw new ActionError("Bad destination side.");
    } else {
      throw new ActionError("Unknown zone.");
    }

    removeAt(this.b, f.loc);
    const dropped: CardInstance[] = [];
    const leavingField = isOnField(f.loc) && (isPileZone(zone));
    if (leavingField && card.materials?.length) {
      for (const m of card.materials) {
        settle(m, "gy", true, undefined);
        this.b.players[m.owner].gy.push(m);
        dropped.push(m);
      }
      delete card.materials;
    }
    if (isPileZone(zone) && card.token) {
      return { what: label(card, wasPublic), to: zone, toPlayer, vanished: true, dropped };
    }

    settle(card, zone, dest.faceUp, dest.position);
    if (isPileZone(zone)) {
      delete card.materials;
      const pile = this.b.players[toPlayer][zone as PileZone];
      if (zone === "deck" && dest.deckPos === "bottom") pile.push(card);
      else if (zone === "deck") pile.unshift(card);
      else pile.push(card); // hand / GY / banished / extra: newest last (top of the pile = last)
    } else if (zone === "field") {
      const pb = this.b.players[toPlayer];
      if (pb.field) throw new ActionError("That Field Zone is occupied.");
      pb.field = card;
    } else {
      const arr = slotArray(this.b, zone, toPlayer);
      slot = dest.slot ?? firstFree(arr);
      if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT[zone]) throw new ActionError("No free zone there.");
      if (arr[slot]) throw new ActionError("That zone is occupied.");
      arr[slot] = card;
      if (zone === "extraMonster") card.controller = toPlayer;
    }
    const nowPublic = isPublic(card, { kind: "zone", zone });
    return { what: label(card, wasPublic || nowPublic), to: zone, toPlayer, slot, dropped };
  }

  droppedLog(dropped: CardInstance[]) {
    if (dropped.length) this.log(`${plural(dropped.length, "Xyz material")} sent to the GY: ${dropped.map((c) => cardToken(c.code)).join(", ")}.`);
  }
}

function zoneName(zone: Zone, slot?: number): string {
  const n = slot !== undefined ? ` ${slot + 1}` : "";
  switch (zone) {
    case "monster": return `Monster Zone${n}`;
    case "spelltrap": return `Spell & Trap Zone${n}`;
    case "pendulum": return slot === 0 ? "the left Pendulum Zone" : "the right Pendulum Zone";
    case "extraMonster": return slot === 0 ? "the left Extra Monster Zone" : "the right Extra Monster Zone";
    case "field": return "the Field Zone";
    default: return SRC_LABEL[zone];
  }
}

/** Log wording for a plain move. */
function moveLine(c: Ctx, from: Loc, r: ReturnType<Ctx["place"]>, dest: MoveDest, card: CardInstance): string {
  const who = c.name();
  const src = SRC_LABEL[zoneOf(from)];
  const theirs = r.toPlayer !== c.actor ? `${c.name(r.toPlayer)}'s ` : "";
  if (r.vanished) return `${who}'s ${r.what} left the field and was removed.`;
  switch (r.to) {
    case "hand": return zoneOf(from) === "deck" || zoneOf(from) === "gy" || zoneOf(from) === "banished" || zoneOf(from) === "extra"
      ? `${who} adds ${r.what} from ${src} to ${theirs || "their "}hand.` : `${who} returns ${r.what} from ${src} to ${theirs ? theirs : "the "}hand.`;
    case "gy": return `${who} sends ${r.what} from ${src} to ${theirs || "the "}GY.`;
    case "banished": return `${who} banishes ${r.what} from ${src}${card.faceUp ? "" : " face-down"}.`;
    case "deck": return `${who} places ${r.what} from ${src} on the ${dest.deckPos === "bottom" ? "bottom" : "top"} of ${theirs || "the "}Deck.`;
    case "extra": return `${who} returns ${r.what} from ${src} to ${theirs || "the "}Extra Deck${card.faceUp ? " face-up" : ""}.`;
    default: {
      const where = `${theirs}${zoneName(r.to, r.slot)}`;
      const how = r.to === "monster" || r.to === "extraMonster" ? ` in ${posLabel(card.position)} Position` : card.faceUp ? "" : " face-down";
      return isOnField(from) ? `${who} moves ${r.what} to ${where}${how}.` : `${who} places ${r.what} from ${src} in ${where}${how}.`;
    }
  }
}

function topN(c: Ctx, n: number | undefined, zone: "gy" | "banished", faceDown = false) {
  const pb = c.b.players[c.actor];
  const k = Math.min(clampN(n), pb.deck.length);
  if (k === 0) throw new ActionError("Your Deck is empty.");
  const moved: CardInstance[] = [];
  for (let i = 0; i < k; i++) {
    const card = pb.deck.shift()!;
    settle(card, zone, !faceDown, undefined);
    pb[zone].push(card);
    moved.push(card);
  }
  const names = faceDown ? "" : `: ${moved.map((m) => cardToken(m.code)).join(", ")}`;
  c.log(zone === "gy"
    ? `${c.name()} sends the top ${plural(k, "card")} of their Deck to the GY${names}.`
    : `${c.name()} banishes the top ${plural(k, "card")} of their Deck${faceDown ? " face-down" : names}.`);
}

function checkLp(c: Ctx) {
  const [a, b] = [c.b.players[0].lp <= 0, c.b.players[1].lp <= 0];
  if (a && b) c.finished = { winner: null, reason: "Both players' LP reached 0." };
  else if (a || b) {
    const loser: Seat = a ? 0 : 1;
    c.finished = { winner: other(loser), reason: `${c.name(loser)}'s LP reached 0.` };
  }
}

/** Apply one action. Throws ActionError for invalid actions; the input board is not modified. */
export function applyAction(board: BoardState, actor: Seat, action: DuelAction, rng: Rng): ActionResult {
  const b = structuredClone(board);
  const c = new Ctx(b, actor, rng);
  const me = b.players[actor];
  if (!action || typeof action !== "object" || typeof (action as { type?: unknown }).type !== "string") throw new ActionError("Bad action.");

  switch (action.type) {
    case "draw": {
      const k = Math.min(clampN(action.n), me.deck.length);
      if (k === 0) throw new ActionError("Your Deck is empty.");
      for (let i = 0; i < k; i++) {
        const card = me.deck.shift()!;
        settle(card, "hand", undefined, undefined);
        me.hand.push(card);
      }
      c.log(`${c.name()} draws ${plural(k, "card")}.`);
      break;
    }
    case "mill": topN(c, action.n, "gy"); break;
    case "banishTop": topN(c, action.n, "banished", !!action.faceDown); break;
    case "shuffle": {
      shuffleInPlace(me.deck, rng);
      for (const card of me.deck) card.uid = rng.uid(); // so nobody can track a card through the shuffle
      c.log(`${c.name()} shuffles their Deck.`);
      break;
    }
    case "move": {
      const f = c.own(action.uid);
      const card = f.card;
      const r = c.place(f, action.to);
      c.log(moveLine(c, f.loc, r, action.to, card));
      c.droppedLog(r.dropped);
      break;
    }
    case "summon": {
      const f = c.own(action.uid);
      const card = f.card;
      const from = zoneOf(f.loc);
      const zone = action.zone ?? "monster";
      const r = c.place(f, { zone, slot: action.slot, position: action.position ?? "atk" });
      const how = action.how ?? (from === "hand" ? "normal" : "special");
      const verb = how === "normal" ? "Normal Summons" : how === "tribute" ? "Tribute Summons" : "Special Summons";
      c.log(`${c.name()} ${verb} ${r.what}${from !== "hand" ? ` from ${SRC_LABEL[from]}` : ""} in ${posLabel(card.position)} Position.`);
      c.droppedLog(r.dropped);
      break;
    }
    case "activate": {
      const f = c.own(action.uid);
      const card = f.card;
      const from = zoneOf(f.loc);
      if ((from === "spelltrap" || from === "field" || from === "pendulum") && !action.zone) {
        card.faceUp = true;
        delete card.position;
        c.log(`${c.name()} activates ${cardToken(card.code)}.`);
      } else {
        const r = c.place(f, { zone: action.zone ?? "spelltrap", slot: action.slot, faceUp: true });
        c.log(`${c.name()} activates ${r.what}${r.to === "pendulum" ? ` in ${zoneName("pendulum", r.slot)}` : ""}.`);
      }
      break;
    }
    case "set": {
      const f = c.own(action.uid);
      const wasPublic = isPublic(f.card, f.loc);
      const onField = isOnField(f.loc);
      const r = c.place(f, { zone: action.zone, slot: action.slot, faceUp: false });
      const what = action.zone === "monster" ? "a monster" : "a card";
      c.log(onField && wasPublic
        ? `${c.name()} changes ${r.what} to face-down.`
        : `${c.name()} Sets ${wasPublic ? r.what : what}${zoneOf(f.loc) !== "hand" ? ` from ${SRC_LABEL[zoneOf(f.loc)]}` : ""}.`);
      c.droppedLog(r.dropped);
      break;
    }
    case "flip": {
      const f = c.own(action.uid);
      const card = f.card;
      const zone = zoneOf(f.loc);
      if (zone === "hand" || zone === "deck" || zone === "gy") throw new ActionError("Use Reveal to show cards in your hand.");
      if (zone === "monster" || zone === "extraMonster") {
        card.position = card.faceUp ? "faceDownDef" : "atk";
        card.faceUp = !card.faceUp;
      } else if (zone === "spelltrap" || zone === "field") {
        card.faceUp = !card.faceUp;
        if (card.faceUp) delete card.position; else card.position = "faceDown";
      } else {
        card.faceUp = !card.faceUp;
      }
      c.log(`${c.name()} flips ${cardToken(card.code)} face-${card.faceUp ? "up" : "down"}.`);
      break;
    }
    case "position": {
      const f = c.own(action.uid);
      const zone = zoneOf(f.loc);
      if (zone !== "monster" && zone !== "extraMonster") throw new ActionError("Only monsters on the field have a battle position.");
      if (!["atk", "def", "faceDownDef"].includes(action.position)) throw new ActionError("Bad position.");
      const was = f.card.faceUp;
      f.card.position = action.position;
      f.card.faceUp = action.position !== "faceDownDef";
      const what = was || f.card.faceUp ? cardToken(f.card.code) : "a monster";
      c.log(action.position === "faceDownDef"
        ? `${c.name()} changes ${what} to face-down Defense Position.`
        : `${c.name()} ${was ? "changes" : "flips"} ${what} ${was ? "to" : "into"} ${action.position === "def" ? "Defense" : "Attack"} Position.`);
      break;
    }
    case "attach": {
      const target = c.own(action.targetUid);
      if (!isOnField(target.loc)) throw new ActionError("Materials can only be attached to a card on the field.");
      if (action.uid === action.targetUid) throw new ActionError("A card cannot be its own material.");
      const src = c.find(action.uid);
      const srcCtrl = controllerOf(b, src.loc);
      if (srcCtrl !== actor && !isOnField(src.loc)) throw new ActionError("That card is not under your control.");
      if (src.loc.kind === "material" && src.loc.hostUid === action.targetUid) throw new ActionError("Already attached.");
      const card = removeAt(b, src.loc);
      const dropped: CardInstance[] = [];
      for (const m of card.materials ?? []) { settle(m, "gy", true, undefined); b.players[m.owner].gy.push(m); dropped.push(m); }
      delete card.materials; delete card.counters; delete card.controller; delete card.position;
      const host = findCard(b, action.targetUid)!.card;
      if (card.token) {
        c.log(`${c.name()} uses ${label(card, true)} as material; it is removed.`);
      } else {
        card.faceUp = true;
        (host.materials ??= []).push(card);
        const theirs = srcCtrl !== actor ? `${c.name(srcCtrl)}'s ` : "";
        c.log(`${c.name()} attaches ${theirs}${cardToken(card.code)} from ${SRC_LABEL[zoneOf(src.loc)]} to ${cardToken(host.code)} as material.`);
      }
      c.droppedLog(dropped);
      break;
    }
    case "detach": {
      const host = c.own(action.targetUid);
      const m = c.find(action.materialUid);
      if (m.loc.kind !== "material" || m.loc.hostUid !== action.targetUid) throw new ActionError("That card is not a material of this card.");
      const r = c.place(m, action.to ?? { zone: "gy" });
      c.log(`${c.name()} detaches ${r.what} from ${cardToken(host.card.code)}${r.to === "gy" ? "" : ` (to ${SRC_LABEL[r.to]})`}.`);
      break;
    }
    case "counter": {
      const f = c.find(action.uid);
      if (!isOnField(f.loc)) throw new ActionError("Counters can only be placed on cards on the field.");
      const name = String(action.name || "Counter").slice(0, 24);
      const delta = Math.trunc(Number(action.delta));
      if (!delta || !Number.isFinite(delta) || Math.abs(delta) > 99) throw new ActionError("Bad counter amount.");
      const counters = (f.card.counters ??= {});
      const now = Math.max(0, (counters[name] ?? 0) + delta);
      if (now === 0) delete counters[name]; else counters[name] = now;
      if (!Object.keys(counters).length) delete f.card.counters;
      const what = label(f.card, f.card.faceUp);
      c.log(delta > 0
        ? `${c.name()} places ${plural(delta, name)} on ${what} (${now}).`
        : `${c.name()} removes ${plural(-delta, name)} from ${what} (${now}).`);
      break;
    }
    case "lp": {
      const p = action.player;
      if (p !== 0 && p !== 1) throw new ActionError("Bad player.");
      const pb = b.players[p];
      const before = pb.lp;
      let after: number;
      if (action.set !== undefined) after = Math.trunc(Number(action.set));
      else after = before + Math.trunc(Number(action.delta));
      if (!Number.isFinite(after)) throw new ActionError("Bad LP amount.");
      after = Math.max(0, Math.min(999999, after));
      if (after === before) throw new ActionError("LP unchanged.");
      pb.lp = after;
      const diff = after - before;
      const whose = p === actor ? "their" : `${c.name(p)}'s`;
      c.log(`${c.name()} ${diff < 0 ? "reduces" : "increases"} ${whose} LP by ${Math.abs(diff)}: ${before} → ${after}.`);
      checkLp(c);
      break;
    }
    case "reveal": {
      const f = c.own(action.uid);
      c.events.push({ kind: "reveal", player: actor, cards: [structuredClone(f.card)] });
      c.log(`${c.name()} reveals ${cardToken(f.card.code)} from ${SRC_LABEL[zoneOf(f.loc)]}.`);
      break;
    }
    case "revealHand": {
      if (!me.hand.length) throw new ActionError("Your hand is empty.");
      c.events.push({ kind: "reveal", player: actor, cards: structuredClone(me.hand) });
      c.log(`${c.name()} reveals their hand: ${me.hand.map((h) => cardToken(h.code)).join(", ")}.`);
      break;
    }
    case "lookTop": {
      const k = Math.min(clampN(action.n), me.deck.length);
      if (k === 0) throw new ActionError("Your Deck is empty.");
      c.peek = { title: `Top ${plural(k, "card")} of your Deck`, cards: structuredClone(me.deck.slice(0, k)) };
      c.log(`${c.name()} looks at the top ${plural(k, "card")} of their Deck.`);
      break;
    }
    case "viewDeck": {
      if (!me.deck.length) throw new ActionError("Your Deck is empty.");
      c.peek = { title: "Your Deck", cards: structuredClone(me.deck) };
      c.log(`${c.name()} looks through their Deck.`);
      break;
    }
    case "attack": {
      const a = c.own(action.uid);
      const az = zoneOf(a.loc);
      if (az !== "monster" && az !== "extraMonster") throw new ActionError("Only monsters on the field can attack.");
      let targetText = "directly";
      let targetUid: string | null = null;
      if (action.targetUid) {
        const t = c.find(action.targetUid);
        const tz = zoneOf(t.loc);
        if ((tz !== "monster" && tz !== "extraMonster") || controllerOf(b, t.loc) === actor) throw new ActionError("Attack target must be an opponent's monster.");
        targetText = t.card.faceUp ? cardToken(t.card.code) : "a face-down monster";
        targetUid = t.card.uid;
      }
      c.events.push({ kind: "attack", player: actor, attacker: a.card.uid, target: targetUid });
      c.log(`${c.name()}'s ${label(a.card, a.card.faceUp)} attacks ${targetText}.`);
      break;
    }
    case "phase": {
      if (!PHASE_LABEL[action.phase]) throw new ActionError("Unknown phase.");
      const block = manualPhaseBlock(b, actor, action.phase);   // same rules as the phase track
      if (block) throw new ActionError(block);
      b.phase = action.phase;
      c.log(`${c.name()} enters the ${PHASE_LABEL[action.phase]}.`);
      break;
    }
    case "endTurn": {
      if (b.turnPlayer !== actor) throw new ActionError("It is not your turn.");
      b.turn += 1;
      b.turnPlayer = other(actor);
      b.phase = "draw";
      c.log(`${c.name()} ends their turn. Turn ${b.turn}: ${c.name(b.turnPlayer)}.`);
      break;
    }
    case "dice": {
      const value = rng.int(6) + 1;
      c.events.push({ kind: "dice", player: actor, value });
      c.log(`${c.name()} rolls a die: ${value}.`);
      break;
    }
    case "coin": {
      const heads = rng.int(2) === 0;
      c.events.push({ kind: "coin", player: actor, heads });
      c.log(`${c.name()} flips a coin: ${heads ? "Heads" : "Tails"}.`);
      break;
    }
    case "token": {
      const p = action.player ?? actor;
      if (p !== 0 && p !== 1) throw new ActionError("Bad player.");
      const arr = b.players[p].monster;
      const slot = action.slot ?? firstFree(arr);
      if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new ActionError("No free Monster Zone.");
      if (arr[slot]) throw new ActionError("That zone is occupied.");
      const code = Number.isInteger(action.code) && action.code! > 0 ? action.code! : DEFAULT_TOKEN_CODE;
      const position = action.position === "def" ? "def" : "atk";
      arr[slot] = { uid: rng.uid(), code, owner: p, faceUp: true, position, token: true };
      c.log(`${c.name()} Special Summons ${code > 0 ? `a ${cardToken(code)}` : "a Token"}${p !== actor ? ` to ${c.name(p)}'s field` : ""} in ${posLabel(position)} Position.`);
      break;
    }
    case "removeToken": {
      const f = c.own(action.uid);
      if (!f.card.token) throw new ActionError("That card is not a token.");
      removeAt(b, f.loc);
      c.log(`${c.name()} removes ${label(f.card, true)}.`);
      break;
    }
    case "takeControl": {
      const f = c.find(action.uid);
      const zone = zoneOf(f.loc);
      const ctrl = controllerOf(b, f.loc);
      if (ctrl === actor) throw new ActionError("You already control that card.");
      if (zone !== "monster" && zone !== "extraMonster") throw new ActionError("You can only take control of monsters on the field.");
      const what = f.card.faceUp ? label(f.card, true) : "face-down monster";
      if (zone === "extraMonster") {
        f.card.controller = actor;
      } else {
        const arr = me.monster;
        const slot = action.slot ?? firstFree(arr);
        if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new ActionError("You have no free Monster Zone.");
        if (arr[slot]) throw new ActionError("That zone is occupied.");
        const card = removeAt(b, f.loc);
        arr[slot] = card;
      }
      c.log(`${c.name()} takes control of ${c.name(ctrl)}'s ${what}.`);
      break;
    }
    case "concede": {
      c.log(`${c.name()} concedes.`);
      c.finished = { winner: other(actor), reason: `${c.name()} conceded.` };
      break;
    }
    case "rematch":
      throw new ActionError("Rematch is handled by the room.");
    default:
      throw new ActionError(`Unknown action "${(action as { type: string }).type}".`);
  }

  if (b.log.length > MAX_LOG) b.log.splice(0, b.log.length - MAX_LOG);
  return { board: b, events: c.events, peek: c.peek, finished: c.finished };
}
