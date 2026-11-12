// What a player may see in their own prompt. The core names every card in a selection (e.g. "choose
// 1 card your opponent controls" lists their face-down cards with their real codes), so before a prompt
// leaves the engine, the codes of the OPPONENT's hidden cards are blanked (0), the way they're blanked
// on the board. The client finds cards by location + sequence, so selection still works.
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";
import type { Seat } from "../../../shared/duelActions.ts";

const HIDDEN_ZONES = new Set(["hand", "deck", "extra"]);
const FACE_DOWN = new Set(["faceDown", "faceDownDef"]);

interface Ref { code: number; controller: Seat; location: string; position?: string }
const isRef = (v: unknown): v is Ref =>
  !!v && typeof v === "object" && typeof (v as Ref).code === "number" && typeof (v as Ref).location === "string" && ((v as Ref).controller === 0 || (v as Ref).controller === 1);

/** True if `seat` can't see this card's identity. */
export function hiddenFrom(ref: Ref, seat: Seat): boolean {
  if (ref.controller === seat) return false;
  if (HIDDEN_ZONES.has(ref.location)) return true;
  return !!ref.position && FACE_DOWN.has(ref.position);
}

/** A copy of `prompt` with the opponent's hidden cards' codes set to 0. */
export function maskPrompt<T extends EnginePrompt>(prompt: T, seat: Seat = prompt.player): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    if (isRef(v) && hiddenFrom(v, seat)) out.code = 0;
    return out;
  };
  return walk(prompt) as T;
}
