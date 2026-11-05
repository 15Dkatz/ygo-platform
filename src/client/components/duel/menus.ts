// What you can do with a card, depending on where it is. Also the default action for a drag-and-drop
// (or a "Move…" tap followed by a tap on a zone).

import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { DuelAction, Seat } from "../../../shared/duelActions.ts";
import type { Card } from "../../../shared/types.ts";
import type { ZoneRef } from "./Board.tsx";
import { isExtraDeckCard, isFieldSpell, isPendulum } from "./useDuel.ts";

export interface MenuItem {
  label: string;
  run?: () => void;
  sub?: MenuItem[];
  danger?: boolean;
  key?: string;   // keyboard hint shown on the right
}

export type PendingKind = "move" | "attach" | "attack";
export interface Pending { kind: PendingKind; uid: string; label: string }

export interface MenuCtx {
  board: BoardState;
  you: Seat;
  card: CardInstance;
  at: ZoneRef;
  data: Card | null;
  act(a: DuelAction): void;
  pick(p: Pending): void;
  preview(code: number): void;
  showMaterials(card: CardInstance): void;
  askNumber(label: string, def: number): number | null;
  askText(label: string, def: string): string | null;
}

const FIELD_ZONES = new Set(["monster", "spelltrap", "field", "extraMonster", "pendulum"]);
export const onField = (at: ZoneRef) => FIELD_ZONES.has(at.zone);

/** Who controls the card shown at `at`. */
export function controllerAt(card: CardInstance, at: ZoneRef): Seat {
  if (at.zone === "extraMonster") return card.controller ?? card.owner;
  return at.player;
}

function sendToItems(c: MenuCtx): MenuItem[] {
  const { card, act, at } = c;
  const uid = card.uid;
  const fromExtra = card.extraDeck || isExtraDeckCard(c.data);
  const items: MenuItem[] = [];
  if (at.zone !== "gy") items.push({ label: "Send to GY", run: () => act({ type: "move", uid, to: { zone: "gy" } }) });
  if (at.zone !== "banished" || !card.faceUp) items.push({ label: "Banish", run: () => act({ type: "move", uid, to: { zone: "banished", faceUp: true } }) });
  if (at.zone !== "banished" || card.faceUp) items.push({ label: "Banish face-down", run: () => act({ type: "move", uid, to: { zone: "banished", faceUp: false } }) });
  if (fromExtra) {
    if (at.zone !== "extra") items.push({ label: "Return to Extra Deck", run: () => act({ type: "move", uid, to: { zone: "extra", faceUp: false } }) });
    if (isPendulum(c.data)) items.push({ label: "To Extra Deck face-up", run: () => act({ type: "move", uid, to: { zone: "extra", faceUp: true } }) });
  } else {
    if (at.zone !== "hand") items.push({ label: at.zone === "deck" || at.zone === "gy" || at.zone === "banished" ? "Add to hand" : "Return to hand", run: () => act({ type: "move", uid, to: { zone: "hand" } }) });
    items.push({ label: "Deck: top", run: () => act({ type: "move", uid, to: { zone: "deck", deckPos: "top" } }) });
    items.push({ label: "Deck: bottom", run: () => act({ type: "move", uid, to: { zone: "deck", deckPos: "bottom" } }) });
    items.push({ label: "Shuffle into Deck", run: () => { act({ type: "move", uid, to: { zone: "deck" } }); act({ type: "shuffle" }); } });
    if (isPendulum(c.data)) items.push({ label: "To Extra Deck face-up", run: () => act({ type: "move", uid, to: { zone: "extra", faceUp: true } }) });
  }
  return items;
}

function summonItems(c: MenuCtx, special: boolean): MenuItem[] {
  const { card, act } = c;
  const uid = card.uid;
  const extra = card.extraDeck || isExtraDeckCard(c.data);
  const items: MenuItem[] = [];
  if (!special) {
    items.push({ label: "Normal Summon", run: () => act({ type: "summon", uid, how: "normal" }) });
    items.push({ label: "Set monster", run: () => act({ type: "set", uid, zone: "monster" }) });
    items.push({ label: "Tribute Summon", run: () => act({ type: "summon", uid, how: "tribute" }) });
  }
  items.push({ label: "Special Summon (ATK)", run: () => act({ type: "summon", uid, how: "special", position: "atk" }) });
  items.push({ label: "Special Summon (DEF)", run: () => act({ type: "summon", uid, how: "special", position: "def" }) });
  if (extra) {
    items.push({ label: "Special Summon to Extra Monster Zone", run: () => act({ type: "summon", uid, how: "special", zone: "extraMonster" }) });
  }
  if (special) items.push({ label: "Special Summon face-down DEF", run: () => act({ type: "set", uid, zone: "monster" }) });
  return items;
}

function spellItems(c: MenuCtx): MenuItem[] {
  const { card, act, data } = c;
  const uid = card.uid;
  const items: MenuItem[] = [];
  if (isFieldSpell(data)) {
    items.push({ label: "Activate Field Spell", run: () => act({ type: "activate", uid, zone: "field" }) });
    items.push({ label: "Set Field Spell", run: () => act({ type: "set", uid, zone: "field" }) });
  } else {
    items.push({ label: "Activate", run: () => act({ type: "activate", uid, zone: "spelltrap" }) });
    items.push({ label: "Set", run: () => act({ type: "set", uid, zone: "spelltrap" }) });
  }
  return items;
}

function pendulumItems(c: MenuCtx): MenuItem[] {
  const uid = c.card.uid;
  // Master Rule 5: the Pendulum Zones are the leftmost / rightmost Spell & Trap Zones.
  return [
    { label: "Activate as left Pendulum Scale", run: () => c.act({ type: "activate", uid, zone: "spelltrap", slot: 0 }) },
    { label: "Activate as right Pendulum Scale", run: () => c.act({ type: "activate", uid, zone: "spelltrap", slot: 4 }) },
  ];
}

function counterItems(c: MenuCtx): MenuItem[] {
  const { card, act } = c;
  const uid = card.uid;
  const names = Object.keys(card.counters ?? {});
  const items: MenuItem[] = [
    { label: "Add counter", run: () => act({ type: "counter", uid, name: names[0] ?? "Counter", delta: 1 }) },
    { label: "Add named counters…", run: () => {
      const name = c.askText("Counter name", names[0] ?? "Counter");
      if (!name) return;
      const n = c.askNumber("How many?", 1);
      if (n) act({ type: "counter", uid, name, delta: n });
    } },
  ];
  for (const n of names) items.push({ label: `Remove ${n} (${card.counters![n]})`, run: () => act({ type: "counter", uid, name: n, delta: -1 }) });
  return items;
}

export function buildMenu(c: MenuCtx): MenuItem[] {
  const { card, at, act, you, data } = c;
  const uid = card.uid;
  const mine = controllerAt(card, at) === you;
  const known = card.code !== 0 || card.token;
  const items: MenuItem[] = [];
  if (known && !card.token) items.push({ label: "View card", run: () => c.preview(card.code) });

  if (!mine) {
    if (onField(at) && (at.zone === "monster" || at.zone === "extraMonster")) {
      items.push({ label: "Take control", run: () => act({ type: "takeControl", uid }) });
    }
    if (onField(at)) {
      items.push({ label: "Attach to one of your Xyz…", run: () => c.pick({ kind: "attach", uid, label: "Choose your monster to attach this to" }) });
      items.push({ label: "Counters", sub: counterItems(c) });
    }
    if (card.materials?.length) items.push({ label: `Xyz materials (${card.materials.length})`, run: () => c.showMaterials(card) });
    return items;
  }

  const isMonster = data ? data.category === "Monster" : true;
  const isSpell = data ? data.category === "Spell" || data.category === "Trap" : true;

  switch (at.zone) {
    case "hand": {
      if (isMonster) items.push(...summonItems(c, false));
      if (isSpell) items.push(...spellItems(c));
      if (isPendulum(data)) items.push(...pendulumItems(c));
      items.push({ label: "Reveal", run: () => act({ type: "reveal", uid }) });
      items.push({ label: "Move to zone…", run: () => c.pick({ kind: "move", uid, label: "Tap a zone or pile to move the card there" }) });
      items.push({ label: "Send to…", sub: sendToItems(c) });
      break;
    }
    case "monster": case "extraMonster": {
      items.push({ label: "Declare attack…", run: () => c.pick({ kind: "attack", uid, label: "Tap the monster to attack, or Direct attack" }) });
      if (card.faceUp) {
        items.push(card.position === "def"
          ? { label: "Change to ATK Position", run: () => act({ type: "position", uid, position: "atk" }) }
          : { label: "Change to DEF Position", run: () => act({ type: "position", uid, position: "def" }) });
        items.push({ label: "Set face-down (DEF)", run: () => act({ type: "position", uid, position: "faceDownDef" }) });
      } else {
        items.push({ label: "Flip face-up (ATK)", run: () => act({ type: "position", uid, position: "atk" }) });
        items.push({ label: "Flip face-up (DEF)", run: () => act({ type: "position", uid, position: "def" }) });
      }
      items.push({ label: "Attach as material to…", run: () => c.pick({ kind: "attach", uid, label: "Tap the Xyz Monster to attach this card to" }) });
      if (card.materials?.length) {
        items.push({ label: `Xyz materials (${card.materials.length})`, run: () => c.showMaterials(card) });
        items.push({ label: "Detach 1 material", run: () => act({ type: "detach", targetUid: uid, materialUid: card.materials![card.materials!.length - 1].uid }) });
      }
      items.push({ label: "Counters", sub: counterItems(c) });
      items.push({ label: "Move to zone…", run: () => c.pick({ kind: "move", uid, label: "Tap a zone or pile to move the card there" }) });
      items.push({ label: "Give control to opponent", run: () => act({ type: "move", uid, to: { zone: "monster", player: you === 0 ? 1 : 0 } }) });
      if (card.token) items.push({ label: "Remove token", danger: true, run: () => act({ type: "removeToken", uid }) });
      else items.push({ label: "Send to…", sub: sendToItems(c) });
      if (!card.token) items.splice(1, 0, { label: "Send to GY", run: () => act({ type: "move", uid, to: { zone: "gy" } }) });
      if (card.token) items.splice(1, 0, { label: "Destroy token", run: () => act({ type: "move", uid, to: { zone: "gy" } }) });
      break;
    }
    case "spelltrap": case "field": case "pendulum": {
      if (!card.faceUp) items.push({ label: "Activate / flip face-up", run: () => act({ type: "activate", uid }) });
      else items.push({ label: "Set face-down", run: () => act({ type: "flip", uid }) });
      items.push({ label: "Send to GY", run: () => act({ type: "move", uid, to: { zone: "gy" } }) });
      if (isMonster && data?.category === "Monster") items.push(...summonItems(c, true));
      items.push({ label: "Counters", sub: counterItems(c) });
      items.push({ label: "Move to zone…", run: () => c.pick({ kind: "move", uid, label: "Tap a zone or pile to move the card there" }) });
      items.push({ label: "Send to…", sub: sendToItems(c) });
      break;
    }
    case "deck": case "gy": case "banished": case "extra": {
      if (isMonster) items.push(...summonItems(c, true));
      if (isSpell && at.zone !== "extra") items.push(...spellItems(c));
      if (isPendulum(data) && at.zone === "extra") items.push(...pendulumItems(c));
      if (at.zone === "banished" || (at.zone === "extra" && isPendulum(data))) items.push({ label: card.faceUp ? "Turn face-down" : "Turn face-up", run: () => act({ type: "flip", uid }) });
      items.push({ label: "Attach as material to…", run: () => c.pick({ kind: "attach", uid, label: "Tap the Xyz Monster to attach this card to" }) });
      items.push({ label: "Reveal", run: () => act({ type: "reveal", uid }) });
      items.push({ label: "Move to zone…", run: () => c.pick({ kind: "move", uid, label: "Tap a zone or pile to move the card there" }) });
      items.push(...sendToItems(c));
      break;
    }
  }
  return items;
}

/** Menu for a pile click (your Deck / Extra Deck / GY / banished, or the opponent's public piles). */
export function pileMenu(opts: {
  at: ZoneRef; you: Seat | null; count: number;
  act(a: DuelAction): void; view(): void; askNumber(label: string, def: number): number | null;
}): MenuItem[] {
  const { at, you, act, view, askNumber } = opts;
  const mine = you === at.player;
  if (at.zone === "deck") {
    if (!mine) return [];
    return [
      { label: "Draw", key: "D", run: () => act({ type: "draw" }) },
      { label: "Draw…", run: () => { const n = askNumber("Draw how many?", 2); if (n) act({ type: "draw", n }); } },
      { label: "Search Deck (look at all)", run: () => act({ type: "viewDeck" }) },
      { label: "Look at top cards…", run: () => { const n = askNumber("Look at how many?", 3); if (n) act({ type: "lookTop", n }); } },
      { label: "Shuffle", key: "H", run: () => act({ type: "shuffle" }) },
      { label: "Mill 1 (top to GY)", run: () => act({ type: "mill", n: 1 }) },
      { label: "Mill…", run: () => { const n = askNumber("Send how many from the top to the GY?", 3); if (n) act({ type: "mill", n }); } },
      { label: "Banish top card", run: () => act({ type: "banishTop", n: 1 }) },
      { label: "Banish top card face-down", run: () => act({ type: "banishTop", n: 1, faceDown: true }) },
    ];
  }
  if (!opts.count) return [];
  return [{ label: "View", run: view }];
}

/** Find a card on the (masked) board by uid, including Xyz materials (reported at their host's zone). */
export function locate(b: BoardState, uid: string): { card: CardInstance; at: ZoneRef; host?: CardInstance } | null {
  for (const p of [0, 1] as Seat[]) {
    const pb = b.players[p];
    for (const zone of ["hand", "deck", "extra", "gy", "banished"] as const) {
      const i = pb[zone].findIndex((c) => c.uid === uid);
      if (i >= 0) return { card: pb[zone][i], at: { zone, player: p, slot: i } };
    }
    for (const zone of ["monster", "spelltrap", "pendulum"] as const) {
      for (let i = 0; i < pb[zone].length; i++) {
        const c = pb[zone][i];
        if (c?.uid === uid) return { card: c, at: { zone, player: p, slot: i } };
        const m = c?.materials?.find((x) => x.uid === uid);
        if (c && m) return { card: m, at: { zone, player: p, slot: i }, host: c };
      }
    }
    if (pb.field?.uid === uid) return { card: pb.field, at: { zone: "field", player: p } };
  }
  for (let i = 0; i < b.extraMonster.length; i++) {
    const c = b.extraMonster[i];
    if (!c) continue;
    const player = c.controller ?? c.owner;
    if (c.uid === uid) return { card: c, at: { zone: "extraMonster", player, slot: i } };
    const m = c.materials?.find((x) => x.uid === uid);
    if (m) return { card: m, at: { zone: "extraMonster", player, slot: i }, host: c };
  }
  return null;
}

/** The card currently in a field zone (for drops onto occupied zones). */
export function occupantAt(b: BoardState, at: ZoneRef): CardInstance | null {
  switch (at.zone) {
    case "monster": case "spelltrap": case "pendulum": return b.players[at.player][at.zone][at.slot ?? -1] ?? null;
    case "extraMonster": return b.extraMonster[at.slot ?? -1] ?? null;
    case "field": return b.players[at.player].field;
    default: return null;
  }
}

/** Default action when `card` (at `from`) is dropped on `to`. `occupant` = card already in that zone. */
export function dropAction(card: CardInstance, from: ZoneRef, to: ZoneRef, data: Card | null, you: Seat, occupant: CardInstance | null): DuelAction | { error: string } | null {
  const uid = card.uid;
  if (from.zone === to.zone && from.player === to.player && from.slot === to.slot && to.zone !== "deck") return null;
  switch (to.zone) {
    case "gy": return { type: "move", uid, to: { zone: "gy" } };
    case "banished": return { type: "move", uid, to: { zone: "banished", faceUp: true } };
    case "hand": return { type: "move", uid, to: { zone: "hand" } };
    case "extra": return { type: "move", uid, to: { zone: "extra", faceUp: false } };
    case "deck": return { type: "move", uid, to: { zone: "deck", deckPos: "top" } };
    case "monster": case "extraMonster": {
      if (occupant && occupant.uid !== uid) {
        const occCtrl = to.zone === "extraMonster" ? occupant.controller ?? occupant.owner : to.player;
        if (occCtrl !== you) return { error: "That zone is occupied." };
        return { type: "attach", uid, targetUid: occupant.uid };
      }
      if (onField(from) || to.player !== you) return { type: "move", uid, to: { zone: to.zone, slot: to.slot, player: to.player } };
      const how = from.zone === "hand" ? "normal" : "special";
      return { type: "summon", uid, zone: to.zone, slot: to.slot, position: "atk", how };
    }
    case "spelltrap": case "pendulum": {
      if (occupant && occupant.uid !== uid) return { error: "That zone is occupied." };
      if (onField(from) || to.player !== you) return { type: "move", uid, to: { zone: to.zone, slot: to.slot, player: to.player } };
      if (data?.category === "Trap" || (!data && from.zone === "hand")) return { type: "set", uid, zone: "spelltrap", slot: to.slot };
      return { type: "activate", uid, zone: to.zone === "pendulum" ? "pendulum" : "spelltrap", slot: to.slot };
    }
    case "field": {
      if (occupant && occupant.uid !== uid) return { error: "The Field Zone is occupied." };
      if (onField(from) || to.player !== you) return { type: "move", uid, to: { zone: "field", player: to.player } };
      return { type: "activate", uid, zone: "field" };
    }
  }
  return null;
}
