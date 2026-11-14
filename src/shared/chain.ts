// The open chain (rules-enforced duels), kept the same way on the server (so a page that loads mid-chain
// can show it) and on the client (the chain display, the resolving card's glow).
import type { EngineCardRef, EngineEvent } from "./enginePrompts.ts";

export interface OpenChainLink {
  link: number;
  card: EngineCardRef;
  desc: string;
  /** The card the effect text belongs to, for an effect granted by another card. */
  from?: number;
  resolving?: boolean;
}

/** Apply engine events to an open chain: links added in order, the resolving one marked, cleared at the end. */
export function applyChain(chain: OpenChainLink[], events: EngineEvent[]): OpenChainLink[] {
  let out = chain;
  for (const e of events) {
    if (e.e === "chain") out = [...out.filter((l) => l.link < e.link), { link: e.link, card: e.card, desc: e.desc, ...(e.from ? { from: e.from } : {}) }];
    else if (e.e === "chainSolving") out = out.map((l) => ({ ...l, resolving: l.link === e.link }));
    else if (e.e === "chainSolved") out = out.filter((l) => l.link !== e.link);
    else if (e.e === "chainEnd" || e.e === "turn") out = [];
  }
  return out;
}
