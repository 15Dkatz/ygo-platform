import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.ts";

/**
 * One duel room. PHASE 3 implements manual mode (shared board state, players move cards
 * themselves). PHASE 4 adds engine mode (ocgcore WASM enforces the rules). The room's
 * mode is fixed when it is created; players can switch an engine duel to manual.
 */
export class DuelRoom extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response("duel rooms not implemented yet", { status: 501 });
  }
}
