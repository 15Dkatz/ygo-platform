// Auto-pass chains (rules-enforced duels): the engine asks "chain a card?" whenever you *could*
// respond, which with a set trap means at almost every step. This decides when to answer "don't chain"
// for the player.
//
//   "ask"   - always ask (no auto-pass)
//   "smart" - auto-pass unless the opponent just did something worth answering (activated a card or
//             effect, summoned, attacked, set up a chain); always ask for your monsters' effects
//   "never" - auto-pass whenever the only options are set Spells/Traps or Quick-Plays in hand;
//             still ask for your monsters' effects (triggers, hand traps)
import type { Seat } from "./duelActions.ts";
import type { EngineEvent, EnginePrompt } from "./enginePrompts.ts";

export type AutoPassMode = "ask" | "smart" | "never";
export const AUTO_PASS_LABEL: Record<AutoPassMode, string> = { ask: "Always ask", smart: "Smart", never: "Only my monsters" };

/** Did the opponent do something since the last prompt that you might want to respond to? */
export function opponentActed(events: EngineEvent[], me: Seat): boolean {
  return events.some((e) =>
    (e.e === "chain" && e.card.controller !== me)
    || (e.e === "summon" && e.card.controller !== me)
    || (e.e === "attack" && e.attacker.controller !== me));
}

/** Did anything happen since the last prompt besides phase / turn changes and draws? */
export function somethingHappened(events: EngineEvent[]): boolean {
  return events.some((e) => e.e === "summon" || e.e === "chain" || e.e === "attack" || e.e === "battle" || e.e === "set"
    || e.e === "reposition" || e.e === "target" || e.e === "confirm" || (e.e === "lp" && e.delta !== 0) || e.e === "move");
}

/** Answer "don't chain" for the player? `events` = what happened since the previous prompt; `seenBefore` =
 *  the cards offered at your previous chance to chain (that you passed on). */
export function shouldAutoPass(prompt: EnginePrompt | null, me: Seat | null, events: EngineEvent[], mode: AutoPassMode,
  isMonster: (code: number) => boolean = () => true, seenBefore: ReadonlySet<number> = new Set()): boolean {
  if (!prompt || me === null || prompt.player !== me || mode === "ask") return false;
  if (prompt.kind !== "selectChain" || prompt.forced || !prompt.cards.length) return false;
  // a quick effect offered again at a bare phase change (nothing happened since you last passed on it): pass.
  // A card offered for the first time (e.g. a Standby Phase trigger) still asks.
  if (!somethingHappened(events) && prompt.cards.every((c) => c.code > 0 && seenBefore.has(c.code))) return true;
  // a monster effect (a trigger, a quick effect on the field / in the GY, a hand trap) is always yours to decide
  const onlySpellTraps = prompt.cards.every((c) => c.location === "spelltrap" || c.location === "field" || (c.location === "hand" && !isMonster(c.code)));
  if (!onlySpellTraps) return false;
  if (mode === "never") return true;
  return !opponentActed(events, me);
}

/** What auto-chaining answers for the player, or null to ask them. Beyond passing (shouldAutoPass):
 *  a mandatory effect with exactly one option activates by itself, and the order of several of your
 *  own simultaneous effects uses the default order. "ask" mode never answers. */
export type AutoAnswer = { kind: "selectChain"; index: number | null; passed?: boolean } | { kind: "sort"; order: null };
export function autoAnswer(prompt: EnginePrompt | null, me: Seat | null, events: EngineEvent[], mode: AutoPassMode,
  isMonster: (code: number) => boolean = () => true, seenBefore: ReadonlySet<number> = new Set()): AutoAnswer | null {
  if (!prompt || me === null || prompt.player !== me || mode === "ask") return null;
  if (prompt.kind === "selectChain" && prompt.forced && prompt.cards.length === 1) return { kind: "selectChain", index: 0 };
  if (prompt.kind === "sort" && prompt.chain) return { kind: "sort", order: null };
  if (shouldAutoPass(prompt, me, events, mode, isMonster, seenBefore)) return { kind: "selectChain", index: null, passed: true };
  return null;
}
