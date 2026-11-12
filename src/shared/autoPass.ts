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

/** Answer "don't chain" for the player? `events` = what happened since the previous prompt. */
export function shouldAutoPass(prompt: EnginePrompt | null, me: Seat | null, events: EngineEvent[], mode: AutoPassMode,
  isMonster: (code: number) => boolean = () => true): boolean {
  if (!prompt || me === null || prompt.player !== me || mode === "ask") return false;
  if (prompt.kind !== "selectChain" || prompt.forced || !prompt.cards.length) return false;
  // a monster effect (a trigger, a quick effect on the field / in the GY, a hand trap) is always yours to decide
  const onlySpellTraps = prompt.cards.every((c) => c.location === "spelltrap" || c.location === "field" || (c.location === "hand" && !isMonster(c.code)));
  if (!onlySpellTraps) return false;
  if (mode === "never") return true;
  return !opponentActed(events, me);
}
