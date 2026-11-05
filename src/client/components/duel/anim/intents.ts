// What to animate after a board update, as plain data (no DOM): one list of intents for both
// modes. Engine mode derives them from the engine's events (its board uids are positions, so
// cards can't be followed by uid); manual mode diffs the two boards by uid (stable per copy).
// The animator (animator.ts) resolves each Spot to a screen rectangle and plays them in order.

import type { BoardState, CardInstance, Position } from "../../../../shared/duel.ts";
import type { EngineCardRef, EngineEvent, Seat } from "../../../../shared/enginePrompts.ts";
import { engineFirst, indexBoard, overlayHostUid, refUid, refZone, zoneKey, type Located } from "../../engine/boardRefs.ts";
import type { ZoneRef } from "../Board.tsx";

/** A place on screen: a card element by uid when there is one, else the zone / pile element. */
export interface Spot { uid?: string; zone: string }

export type Intent =
  /** A card travels from -> to. `flip`: animate the real element at `to.uid` (FLIP); otherwise a ghost card flies. */
  | { t: "move"; from: Spot; to: Spot; code: number; faceUp: boolean; flip: boolean; reveal?: boolean }
  /** Battle position / face-up change in place. */
  | { t: "rotate"; uid: string; from?: Position; to?: Position; reveal?: boolean }
  | { t: "shuffle"; zone: string }
  | { t: "attack"; attacker: string; target: string | null; side: Seat }
  /** A short glow: activation, summon landing, targeting, a chain link resolving. */
  | { t: "pulse"; uid: string; tone: "activate" | "summon" | "target" | "resolve" }
  /** A short text ribbon over the board ("Chain Link 2 resolves"). */
  | { t: "banner"; text: string };

const pileKey = (zone: ZoneRef["zone"], player: Seat) => zoneKey({ zone, player });
const PILES = new Set(["deck", "extra", "gy", "banished"]);

function refSpot(r: EngineCardRef, first: Seat): Spot {
  if (r.location === "overlay") return { uid: overlayHostUid(r), zone: zoneKey(refZone(r, first)) };
  if (PILES.has(r.location)) return { zone: pileKey(r.location as ZoneRef["zone"], r.controller) };
  return { uid: refUid(r), zone: zoneKey(refZone(r, first)) };
}

const faceDown = (p?: Position) => p === "faceDown" || p === "faceDownDef";
const hiddenLoc = (r: EngineCardRef) => r.location === "deck" || r.location === "hand" || faceDown(r.position);

/** Engine mode: intents from one step's (already masked) events. `prev` / `next` = boards before / after. */
/** `chainUid`: link -> uid of the open chain, kept by the caller across steps. */
export function engineIntents(events: EngineEvent[], prev: BoardState, next: BoardState, chainUid: Map<number, string> = new Map()): Intent[] {
  const first = engineFirst(next);
  const before = indexBoard(prev), after = indexBoard(next);
  const out: Intent[] = [];
  const handLen: [number, number] = [prev.players[0].hand.length, prev.players[1].hand.length];
  // a move's destination is "final" when nothing later in this batch touches that slot again
  const touches: string[][] = events.map((ev) => {
    if (ev.e === "move") return [ev.from, ev.to].filter((r): r is EngineCardRef => !!r && !PILES.has(r.location)).map(refUid);
    return [];
  });
  const finalAt = (i: number, uid: string) => !touches.slice(i + 1).some((t) => t.includes(uid));

  events.forEach((ev, i) => {
    switch (ev.e) {
      case "draw": {
        ev.codes.forEach((code, k) => {
          const uid = `e${ev.player}-2-${handLen[ev.player] + k}`;
          out.push({ t: "move", from: { zone: pileKey("deck", ev.player) }, to: { uid, zone: pileKey("hand", ev.player) }, code, faceUp: code > 0, flip: finalAt(i, uid) });
        });
        handLen[ev.player] += ev.codes.length;
        return;
      }
      case "move": {
        const { from, to } = ev;
        if (!from || !to) return;   // tokens appearing / vanishing
        if (from.location === "hand") handLen[from.controller] = Math.max(0, handLen[from.controller] - 1);
        if (to.location === "hand") handLen[to.controller]++;
        const a = refSpot(from, first), b = refSpot(to, first);
        if (a.zone === b.zone && a.uid === b.uid) return;
        const up = !hiddenLoc(to) && to.location !== "extra" && ev.code > 0 || (to.location === "hand" && ev.code > 0);
        const flip = !!b.uid && to.location !== "overlay" && finalAt(i, b.uid);
        out.push({ t: "move", from: a, to: b, code: ev.code, faceUp: up, flip, reveal: up && hiddenLoc(from) && to.location !== "hand" });
        return;
      }
      case "summon": {
        const uid = refUid(ev.card);
        if (ev.how === "flip") {
          const was = before.get(uid)?.card, now = after.get(uid)?.card;
          out.push({ t: "rotate", uid, from: was?.position ?? "faceDownDef", to: now?.position ?? ev.card.position, reveal: true });
        } else out.push({ t: "pulse", uid, tone: "summon" });
        return;
      }
      case "reposition": {
        const uid = refUid(ev.card);
        const was = before.get(uid)?.card, now = after.get(uid)?.card;
        if (!was || !now || (was.position === now.position && was.faceUp === now.faceUp)) return;
        out.push({ t: "rotate", uid, from: was.position, to: now.position, reveal: !was.faceUp && now.faceUp });
        return;
      }
      case "chain": chainUid.set(ev.link, refUid(ev.card)); out.push({ t: "pulse", uid: refUid(ev.card), tone: "activate" }); return;
      case "chainSolving": {
        const uid = chainUid.get(ev.link);
        if (chainUid.size > 1) out.push({ t: "banner", text: `Chain Link ${ev.link} resolves` });
        if (uid) out.push({ t: "pulse", uid, tone: "resolve" });
        return;
      }
      case "chainEnd": chainUid.clear(); return;
      case "target": ev.cards.forEach((c) => out.push({ t: "pulse", uid: refUid(c), tone: "target" })); return;
      case "attack":
        out.push({ t: "attack", attacker: refUid(ev.attacker), target: ev.target ? refUid(ev.target) : null, side: (1 - ev.attacker.controller) as Seat });
        return;
      case "shuffle": out.push({ t: "shuffle", zone: pileKey(ev.where, ev.player) }); return;
      default: return;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// manual mode: diff by uid

function spotOf(l: Located): Spot {
  if (l.host) return { uid: l.host.uid, zone: zoneKey(l.at) };
  if (PILES.has(l.at.zone) || l.at.zone === "hand") return { uid: l.card.uid, zone: pileKey(l.at.zone, l.at.player) };
  return { uid: l.card.uid, zone: zoneKey(l.at) };
}
const placeOf = (l: Located) => (l.host ? `mat:${l.host.uid}` : PILES.has(l.at.zone) || l.at.zone === "hand" ? pileKey(l.at.zone, l.at.player) : zoneKey(l.at));
const shown = (c: CardInstance) => c.faceUp && c.code !== 0;

/** Manual mode: intents from the difference between two boards. */
export function manualIntents(prev: BoardState, next: BoardState): Intent[] {
  const before = indexBoard(prev), after = indexBoard(next);
  const out: Intent[] = [];
  for (const [uid, now] of after) {
    const was = before.get(uid);
    if (!was) continue;   // a new token
    if (placeOf(was) !== placeOf(now)) {
      const handUp = now.at.zone === "hand" && now.card.code !== 0;
      const up = shown(now.card) || handUp;
      out.push({ t: "move", from: spotOf(was), to: spotOf(now), code: now.card.code, faceUp: up, flip: !now.host, reveal: up && !shown(was.card) && was.at.zone !== "hand" && now.at.zone !== "hand" });
    } else if (!now.host && (was.card.position !== now.card.position || (was.card.faceUp !== now.card.faceUp && !PILES.has(now.at.zone) && now.at.zone !== "hand"))) {
      out.push({ t: "rotate", uid, from: was.card.position, to: now.card.position, reveal: !was.card.faceUp && now.card.faceUp });
    }
  }
  for (const p of [0, 1] as Seat[]) {
    const a = prev.players[p].deck.map((c) => c.uid), b = next.players[p].deck.map((c) => c.uid);
    if (a.length > 1 && a.length === b.length && a.join() !== b.join() && new Set([...a, ...b]).size === a.length) {
      out.push({ t: "shuffle", zone: pileKey("deck", p) });
    }
  }
  return out;
}
