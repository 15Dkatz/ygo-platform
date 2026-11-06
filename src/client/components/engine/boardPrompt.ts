// Engine prompts as board interactions (pure logic, no React): which cards offer which
// actions, which cards / zones a selection prompt highlights, and the response a set of
// picks produces. EngineBoard.tsx turns this into menus, highlights and the floating bar.

import type { BoardState, Zone } from "../../../shared/duel.ts";
import type { EngineCardRef, EnginePrompt, EngineResponseBody } from "../../../shared/enginePrompts.ts";
import { engineFirst, indexBoard, offBoard, placeZone, refUid, zoneKey } from "./boardRefs.ts";

export interface CardAction {
  label: string;
  response: EngineResponseBody;
  /** What the action does to the card, for drag-and-drop: the zone kinds it can be dropped on. */
  drop?: ("monster" | "spelltrap" | "field")[];
}

const short = (s: string, n = 72) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Activate labels: the effect text when a card offers several effects (or always, for chains). */
function activateLabels(refs: { desc: string }[], uids: string[], always: boolean): string[] {
  const count = new Map<string, number>();
  uids.forEach((u) => count.set(u, (count.get(u) ?? 0) + 1));
  return refs.map((r, i) => (r.desc && (always || count.get(uids[i])! > 1) ? `Activate: ${short(r.desc)}` : "Activate"));
}

/** Main Phase / Battle Phase / chain window: every card's legal actions, keyed by board uid. */
export function actionsByUid(p: EnginePrompt): Map<string, CardAction[]> {
  const out = new Map<string, CardAction[]>();
  const add = (r: EngineCardRef, a: CardAction) => {
    const uid = refUid(r);
    out.set(uid, [...(out.get(uid) ?? []), a]);
  };
  if (p.kind === "idle") {
    p.summons.forEach((r, index) => add(r, { label: "Normal Summon", response: { kind: "idle", action: "summon", index }, drop: ["monster"] }));
    p.specialSummons.forEach((r, index) => add(r, { label: "Special Summon", response: { kind: "idle", action: "specialSummon", index }, drop: ["monster"] }));
    p.monsterSets.forEach((r, index) => add(r, { label: "Set", response: { kind: "idle", action: "monsterSet", index }, drop: ["monster"] }));
    p.spellSets.forEach((r, index) => add(r, { label: "Set", response: { kind: "idle", action: "spellSet", index }, drop: ["spelltrap", "field"] }));
    p.repositions.forEach((r, index) => add(r, {
      label: r.position === "atk" ? "Change to Defense Position" : r.position === "def" ? "Change to Attack Position" : "Flip Summon",
      response: { kind: "idle", action: "reposition", index },
    }));
    const labels = activateLabels(p.activates, p.activates.map(refUid), false);
    p.activates.forEach((r, index) => add(r, {
      label: labels[index], response: { kind: "idle", action: "activate", index },
      drop: r.location === "hand" ? ["spelltrap", "field"] : undefined,
    }));
  } else if (p.kind === "battle") {
    p.attacks.forEach((r, index) => add(r, { label: r.direct ? "Attack (can attack directly)" : "Attack", response: { kind: "battle", action: "attack", index } }));
    const labels = activateLabels(p.activates, p.activates.map(refUid), false);
    p.activates.forEach((r, index) => add(r, { label: labels[index], response: { kind: "battle", action: "activate", index } }));
  } else if (p.kind === "selectChain") {
    const labels = activateLabels(p.cards, p.cards.map(refUid), false);
    p.cards.forEach((r, index) => add(r, { label: labels[index], response: { kind: "selectChain", index } }));
  }
  return out;
}

/** The legal action for a hand card dropped on a zone, if exactly one fits (else the candidates). */
export function dropChoices(actions: CardAction[] | undefined, zone: Zone): CardAction[] {
  if (!actions) return [];
  const kind = zone === "monster" || zone === "extraMonster" ? "monster" : zone === "spelltrap" || zone === "pendulum" ? "spelltrap" : zone === "field" ? "field" : null;
  if (!kind) return [];
  return actions.filter((a) => a.drop?.includes(kind));
}

// ---------------------------------------------------------------------------------------
// selection prompts

export type SelectKind = "selectCard" | "selectTribute" | "selectUnselect" | "selectSum" | "selectCounter";
export type SelectPrompt = Extract<EnginePrompt, { kind: SelectKind }>;
export const isSelectPrompt = (p: EnginePrompt): p is SelectPrompt =>
  p.kind === "selectCard" || p.kind === "selectTribute" || p.kind === "selectUnselect" || p.kind === "selectSum" || p.kind === "selectCounter";

export interface SelectItem {
  ref: EngineCardRef;
  uid: string;
  /** The index to answer with (selectUnselect: cards.length + i for already-selected cards). */
  index: number;
  /** Always included (selectSum `must`) / already selected (selectUnselect): shown as picked. */
  fixed?: boolean;
  value?: number;
  available?: number;
}

export function selectItems(p: SelectPrompt): SelectItem[] {
  switch (p.kind) {
    case "selectCard": return p.cards.map((ref, index) => ({ ref, uid: refUid(ref), index }));
    case "selectTribute": return p.cards.map((ref, index) => ({ ref, uid: refUid(ref), index, value: ref.value }));
    case "selectUnselect": return [
      ...p.cards.map((ref, index) => ({ ref, uid: refUid(ref), index })),
      ...p.selected.map((ref, i) => ({ ref, uid: refUid(ref), index: p.cards.length + i, fixed: true })),
    ];
    case "selectSum": return [
      ...p.must.map((ref, i) => ({ ref, uid: refUid(ref), index: -1 - i, fixed: true, value: ref.value })),
      ...p.cards.map((ref, index) => ({ ref, uid: refUid(ref), index, value: ref.value })),
    ];
    case "selectCounter": return p.cards.map((ref, index) => ({ ref, uid: refUid(ref), index, available: ref.available }));
  }
}

/** selectSum values pack two levels (low/high 16 bits) for some cards; either may count. */
const sumValues = (v: number) => { const lo = v & 0xffff, hi = v >>> 16; return hi && hi !== lo ? [lo, hi] : [lo]; };
function sumReaches(values: number[], target: number, exact: boolean): boolean {
  let totals = new Set([0]);
  for (const v of values) {
    const next = new Set<number>();
    for (const t of totals) for (const x of sumValues(v)) next.add(t + x);
    totals = next;
  }
  return [...totals].some((t) => (exact ? t === target : t >= target));
}
export function sumOf(p: Extract<EnginePrompt, { kind: "selectSum" }>, picked: number[]): number {
  return [...p.must.map((c) => c.value), ...picked.map((i) => p.cards[i].value)].reduce((t, v) => t + (v & 0xffff), 0);
}

/** How many tributes a set of picks is worth (double-tribute monsters count 2). */
const tributeValue = (v: number | undefined) => (v && v > 0 && v < 4 ? v : 1);

export interface SelectStatus { ready: boolean; label: string }

/** Is this pick set a valid answer, and the "2/3"-style progress text. */
export function selectStatus(p: SelectPrompt, picked: number[], counts: number[] = []): SelectStatus {
  switch (p.kind) {
    case "selectCard": {
      const n = picked.length;
      return { ready: n >= p.min && n <= p.max, label: p.min === p.max ? `${n}/${p.min}` : `${n} (${p.min}–${p.max})` };
    }
    case "selectTribute": {
      const v = picked.reduce((t, i) => t + tributeValue(p.cards[i].value), 0);
      return { ready: picked.length > 0 && v >= p.min && picked.length <= p.max, label: `${v}/${p.min}${p.max !== p.min ? `–${p.max}` : ""}` };
    }
    case "selectSum": {
      const values = [...p.must.map((c) => c.value), ...picked.map((i) => p.cards[i].value)];
      return { ready: sumReaches(values, p.target, p.exact), label: `${sumOf(p, picked)}/${p.target}` };
    }
    case "selectCounter": {
      const total = counts.reduce((a, b) => a + b, 0);
      return { ready: total === p.count, label: `${total}/${p.count}` };
    }
    case "selectUnselect":
      return { ready: p.canFinish, label: `${p.selected.length} selected` };
  }
}

/** The answer for the current picks (null when they aren't a valid answer yet). */
export function selectResponse(p: SelectPrompt, picked: number[], counts: number[] = []): EngineResponseBody | null {
  if (!selectStatus(p, picked, counts).ready) return null;
  const indices = [...picked].sort((a, b) => a - b);
  switch (p.kind) {
    case "selectCard": return { kind: "selectCard", indices };
    case "selectTribute": return { kind: "selectTribute", indices };
    case "selectSum": return { kind: "selectSum", indices };
    case "selectCounter": return { kind: "selectCounter", counts };
    case "selectUnselect": return { kind: "selectUnselect", index: null };
  }
}

/** A single-card pick answers on the click itself (no Confirm needed). */
export const answersOnClick = (p: SelectPrompt) =>
  p.kind === "selectUnselect" || (p.kind === "selectCard" && p.max === 1 && p.min === 1);

// ---------------------------------------------------------------------------------------
// where the highlighted things are

/** zoneKey of the pile an off-board ref is picked from ("gy:0:", "deck:1:", or "overlay:<host uid>"). */
export function pileKeyOf(r: EngineCardRef): string {
  if (r.location === "overlay") return `overlay:${refUid({ ...r, location: "monster" })}`;
  return zoneKey({ zone: r.location as Zone, player: r.controller });
}

export interface PromptLayout {
  /** uids drawn on the board that the prompt highlights. */
  onBoard: Set<string>;
  /** pile key -> refs picked through the pile viewer. */
  piles: Map<string, EngineCardRef[]>;
  /** Refs that can't be found on the board: the prompt must fall back to the list panel. */
  missing: EngineCardRef[];
}

/** Split a prompt's cards into on-board highlights and pile-viewer groups. */
export function layoutRefs(refs: EngineCardRef[], board: BoardState): PromptLayout {
  const index = indexBoard(board);
  const out: PromptLayout = { onBoard: new Set(), piles: new Map(), missing: [] };
  for (const r of refs) {
    if (offBoard(r)) {
      const k = pileKeyOf(r);
      out.piles.set(k, [...(out.piles.get(k) ?? []), r]);
      continue;
    }
    const uid = refUid(r);
    // hand cards and field cards are drawn one by one
    if (index.has(uid)) out.onBoard.add(uid);
    else out.missing.push(r);
  }
  return out;
}

/** zoneKeys of a select-place prompt's open zones. */
export function placeKeys(p: Extract<EnginePrompt, { kind: "selectPlace" }>, board: BoardState): Map<string, (typeof p.places)[number]> {
  const first = engineFirst(board);
  return new Map(p.places.map((x) => [zoneKey(placeZone(x, first)), x]));
}
