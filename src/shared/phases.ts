// One set of phase rules for the whole app, so the phase track, keyboard shortcuts and the
// server always agree on what you can do.
//   - Manual duels: the turn player moves forward only (no going back), never enters the
//     Battle Phase on the first turn of the duel, and reaches Main Phase 2 only from the
//     Battle Phase. Ending the turn is always allowed for the turn player.
//   - Rules-enforced duels: only what the engine's current prompt offers (Battle Phase /
//     Main Phase 2 / End Turn), and only while that prompt is yours.

import type { EnginePrompt, EngineResponseBody } from "./enginePrompts.ts";
import { PHASES, type Phase, type Seat } from "./duelActions.ts";

export interface PhaseButton {
  phase: Phase;
  current: boolean;
  /** Already passed this turn (drawn as done). */
  past: boolean;
  enabled: boolean;
  /** Why it's disabled (or what clicking does), for the tooltip. */
  hint: string;
}

export interface PhaseControls {
  phases: PhaseButton[];
  endTurn: { enabled: boolean; hint: string };
  /** The phase the "next phase" shortcut goes to, if any. */
  next: Phase | null;
}

interface TurnInfo { turn: number; turnPlayer: Seat; phase: Phase }

const idx = (p: Phase) => PHASES.indexOf(p);

/** Can `actor` move the manual duel from its current phase to `target`? null = yes, else the reason. */
export function manualPhaseBlock(b: TurnInfo, actor: Seat | null, target: Phase): string | null {
  if (actor === null) return "Spectators can't change phases.";
  if (b.turnPlayer !== actor) return "It's your opponent's turn.";
  if (target === b.phase) return "You're already in this phase.";
  if (idx(target) < idx(b.phase)) return "Phases only move forward.";
  if (target === "battle" && b.turn === 1) return "No Battle Phase on the first turn of the duel.";
  if (target === "main2" && b.phase !== "battle") return "Main Phase 2 comes after the Battle Phase.";
  return null;
}

export function manualPhaseControls(b: TurnInfo, you: Seat | null): PhaseControls {
  const phases = PHASES.map((p): PhaseButton => {
    const block = manualPhaseBlock(b, you, p);
    return { phase: p, current: p === b.phase, past: idx(p) < idx(b.phase), enabled: !block, hint: block ?? `Go to the ${label(p)}` };
  });
  const mine = you !== null && b.turnPlayer === you;
  const next = phases.find((x) => x.enabled && idx(x.phase) > idx(b.phase) && !(x.phase === "main2" && b.phase !== "battle"))?.phase ?? null;
  return { phases, endTurn: { enabled: mine, hint: mine ? "End your turn" : you === null ? "Spectating" : "It's your opponent's turn." }, next };
}

/** What a phase click sends to the engine (null = not allowed now). */
export function enginePhaseResponse(prompt: EnginePrompt | null, target: Phase | "endTurn"): EngineResponseBody | null {
  if (!prompt) return null;
  if (prompt.kind === "idle") {
    if (target === "battle" && prompt.canBattle) return { kind: "idle", action: "battle" };
    if ((target === "end" || target === "endTurn") && prompt.canEnd) return { kind: "idle", action: "end" };
  }
  if (prompt.kind === "battle") {
    if (target === "main2" && prompt.canMain2) return { kind: "battle", action: "main2" };
    if ((target === "end" || target === "endTurn") && prompt.canEnd) return { kind: "battle", action: "end" };
  }
  return null;
}

/**
 * Rules-enforced duels. `prompt` is the prompt addressed to you (null when it's not your
 * decision); `waitingFor` names who the duel is waiting on, for the tooltip.
 */
export function enginePhaseControls(b: TurnInfo, you: Seat | null, prompt: EnginePrompt | null, waitingFor: string): PhaseControls {
  const busy = !prompt
    ? you === null ? "Spectating" : `Waiting for ${waitingFor}.`
    : prompt.kind !== "idle" && prompt.kind !== "battle" ? "Finish the current choice first." : null;
  const phases = PHASES.map((p): PhaseButton => {
    const res = busy ? null : enginePhaseResponse(prompt, p);
    const hint = busy ?? (res ? `Go to the ${label(p)}` : p === b.phase ? "You're in this phase." : "The rules don't allow this right now.");
    return { phase: p, current: p === b.phase, past: idx(p) < idx(b.phase), enabled: !!res, hint };
  });
  const end = busy ? null : enginePhaseResponse(prompt, "endTurn");
  const next = phases.find((x) => x.enabled && x.phase !== "end")?.phase ?? null;
  return { phases, endTurn: { enabled: !!end, hint: busy ?? (end ? "End your turn" : "You can't end the turn right now.") }, next };
}

const label = (p: Phase) => ({ draw: "Draw Phase", standby: "Standby Phase", main1: "Main Phase 1", battle: "Battle Phase", main2: "Main Phase 2", end: "End Phase" })[p];
