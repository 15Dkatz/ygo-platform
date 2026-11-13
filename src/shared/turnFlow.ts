import type { EnginePrompt } from "./enginePrompts.ts";

/** Your Main / Battle Phase with nothing left to play: time to move on (Next phase / End turn). */
export function nothingLeftToDo(p: EnginePrompt | null): boolean {
  if (!p) return false;
  if (p.kind === "idle") {
    return !p.summons.length && !p.specialSummons.length && !p.activates.length && !p.spellSets.length && !p.monsterSets.length && !p.repositions.length;
  }
  if (p.kind === "battle") return !p.attacks.length && !p.activates.length;
  return false;
}
