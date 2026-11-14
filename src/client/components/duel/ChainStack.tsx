import type { Seat } from "../../../shared/duelActions.ts";
import type { EngineEvent } from "../../../shared/enginePrompts.ts";
import { CardFace } from "./CardView.tsx";
import { getCard } from "./useDuel.ts";
import { refUid } from "../engine/boardRefs.ts";
import type { OpenChainLink } from "../../../shared/chain.ts";

export interface ChainLink { link: number; code: number; controller: Seat; desc: string; resolving?: boolean; uid?: string; from?: number }

/** Keep the open chain up to date from engine events (links in order; cleared when the chain ends). */
export function applyChainEvents(chain: ChainLink[], events: EngineEvent[]): ChainLink[] {
  let out = chain;
  for (const e of events) {
    if (e.e === "chain") out = [...out.filter((l) => l.link < e.link), { link: e.link, code: e.card.code, controller: e.card.controller, desc: e.desc, uid: refUid(e.card), ...(e.from ? { from: e.from } : {}) }];
    else if (e.e === "chainSolving") out = out.map((l) => ({ ...l, resolving: l.link === e.link }));
    else if (e.e === "chainSolved") out = out.filter((l) => l.link !== e.link);
    else if (e.e === "chainEnd" || e.e === "turn") out = [];
  }
  return out;
}

/** The server's copy of the open chain, as the chain display's links (a page loaded mid-chain). */
export function chainFromSession(links: OpenChainLink[]): ChainLink[] {
  return links.map((l) => ({ link: l.link, code: l.card.code, controller: l.card.controller, desc: l.desc, uid: refUid(l.card), resolving: l.resolving, ...(l.from ? { from: l.from } : {}) }));
}

/** The open chain, newest link on top: what you're responding to. */
export function ChainStack({ chain, you, names, onHover, onZoom }: { chain: ChainLink[]; you: Seat | null; names: [string, string]; onHover?(code: number | null): void; onZoom?(code: number): void }) {
  if (!chain.length) return null;
  return (
    <div className="duel-chainstack" aria-live="polite">
      <span className="duel-chainstack-title">Chain · {chain.length} link{chain.length === 1 ? "" : "s"}</span>
      <ol reversed>
        {[...chain].reverse().map((l) => (
          <li key={l.link} className={`${l.controller === you ? "is-mine" : "is-theirs"} ${l.resolving ? "is-resolving" : ""}`}
            onMouseEnter={() => onHover?.(l.code || null)} onMouseLeave={() => onHover?.(null)} onClick={() => l.code && onZoom?.(l.code)}
            title="Hover to preview, click to zoom" style={{ cursor: l.code ? "zoom-in" : undefined }}>
            <span className="duel-chainstack-n">{l.link}</span>
            <span className="duel-card duel-chainstack-thumb"><span className="duel-card-inner"><CardFace code={l.code} /></span></span>
            <span className="duel-chainstack-text">
              <b>{getCard(l.code)?.name ?? "A card"}</b>
              <small>{l.controller === you ? "You" : names[l.controller]}{l.desc ? ` · ${l.desc}` : ""}{l.from ? ` · from ${getCard(l.from)?.name ?? "another card"}` : ""}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
