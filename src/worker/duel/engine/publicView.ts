// What the room tells EVERYONE about a decision someone else is making ("Bot is choosing: ..."), and the
// open chain everyone sees. Kept in one place so the leak test (leaks.test.ts) checks the real thing.
import type { EngineEvent, EnginePrompt, Seat } from "../../../shared/enginePrompts.ts";
import { applyChain, type OpenChainLink } from "../../../shared/chain.ts";
import { eventsFor } from "./EngineDuel.ts";

export interface PublicDeciding { seat: Seat; kind: string; hint?: string }

/** The decision the duel waits on, as everyone may see it: who, what kind, and the hint only when the
 *  hint is the engine's generic wording. (A hint can be a card's NAME, e.g. "choose a zone" while that
 *  card is Set face-down; that stays with the player who's choosing.) */
export function publicDeciding(prompts: { seat: Seat; prompt: unknown }[] | undefined): PublicDeciding | undefined {
  const first = prompts?.[0];
  if (!first) return undefined;
  const p = first.prompt as { kind?: string; hint?: string; hintIsPublic?: boolean };
  return { seat: first.seat, kind: String(p.kind ?? ""), ...(p.hint && p.hintIsPublic ? { hint: p.hint } : {}) };
}

/** The open chain everyone sees, after these engine events (seat 0's view with its secrets removed too). */
export function publicChain(chain: OpenChainLink[], events: [EngineEvent[], EngineEvent[]]): OpenChainLink[] {
  return applyChain(chain, eventsFor(events[0], 1));
}

export type { EnginePrompt };
