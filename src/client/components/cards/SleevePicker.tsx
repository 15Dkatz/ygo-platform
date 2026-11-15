// Deck builder: pick the sleeve (card back) for this deck. Our designs, popular cards' artwork,
// or the artwork of any card in the deck. Both players see it in a duel.
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SLEEVE, POPULAR_SLEEVES, SCENE_SLEEVES, SLEEVE_DESIGNS, cleanSleeve, sleeveLabel } from "../../../shared/sleeves.ts";
import { SleeveBack } from "../duel/Sleeve.tsx";
import "./SleevePicker.css";

type Tab = "designs" | "backgrounds" | "popular" | "deck";

export function SleevePicker({ value, deckCards, cardName, onPick, onClose }: {
  value: string | undefined;
  /** card ids in the deck (any order, repeats fine) */
  deckCards: number[];
  cardName(id: number): string;
  onPick(sleeve: string): void;
  onClose(): void;
}) {
  const current = cleanSleeve(value);
  const [tab, setTab] = useState<Tab>(current.startsWith("art:") ? "popular" : current.startsWith("scene:") || SLEEVE_DESIGNS.some((d) => d.kind === "scene" && `design:${d.id}` === current) ? "backgrounds" : "designs");
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = hover ?? current;
  const emblems = SLEEVE_DESIGNS.filter((d) => d.kind !== "scene"), scenes = SLEEVE_DESIGNS.filter((d) => d.kind === "scene");
  const fromDeck = useMemo(() => [...new Set(deckCards)].filter((id) => id > 0), [deckCards]);
  const deckList = q ? fromDeck.filter((id) => cardName(id).toLowerCase().includes(q.toLowerCase())) : fromDeck;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const item = (s: string, label: string) => (
    <button key={s} type="button" className={`sl-pick ${s === current ? "is-on" : ""}`} title={label} aria-pressed={s === current}
      onClick={() => onPick(s)} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s)} onBlur={() => setHover(null)}>
      <span className="sl-pick-card"><SleeveBack sleeve={s} /></span>
      <span className="sl-pick-name">{label}</span>
    </button>
  );

  return (
    <div className="sl-picker-backdrop" onClick={onClose}>
      <div className="sl-picker" role="dialog" aria-label="Card sleeve" onClick={(e) => e.stopPropagation()}>
        <div className="sl-picker-preview">
          <div className="sl-preview-card"><SleeveBack sleeve={shown} /></div>
          <b>{sleeveLabel(shown, cardName)}</b>
          <small className="muted">Both players see your sleeve on your hand, Deck and face-down cards.</small>
          {current !== DEFAULT_SLEEVE && <button type="button" onClick={() => onPick(DEFAULT_SLEEVE)}>Reset to classic</button>}
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
        <div className="sl-picker-main">
          <div className="sl-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "designs"} className={tab === "designs" ? "on" : ""} onClick={() => setTab("designs")}>Designs ({emblems.length})</button>
            <button type="button" role="tab" aria-selected={tab === "backgrounds"} className={tab === "backgrounds" ? "on" : ""} onClick={() => setTab("backgrounds")}>Backgrounds ({scenes.length + SCENE_SLEEVES.length})</button>
            <button type="button" role="tab" aria-selected={tab === "popular"} className={tab === "popular" ? "on" : ""} onClick={() => setTab("popular")}>Popular cards ({POPULAR_SLEEVES.length})</button>
            <button type="button" role="tab" aria-selected={tab === "deck"} className={tab === "deck" ? "on" : ""} onClick={() => setTab("deck")}>From this deck ({fromDeck.length})</button>
          </div>
          {tab === "deck" && <input className="sl-search" placeholder="Filter cards in this deck…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter cards" />}
          <div className="sl-grid">
            {tab === "designs" && emblems.map((d) => item(`design:${d.id}`, d.label))}
            {tab === "backgrounds" && scenes.map((d) => item(`design:${d.id}`, d.label))}
            {tab === "backgrounds" && SCENE_SLEEVES.map((p) => item(`scene:${p.code}`, p.label))}
            {tab === "popular" && POPULAR_SLEEVES.map((p) => item(`art:${p.code}`, p.label))}
            {tab === "deck" && (deckList.length ? deckList.map((id) => item(`art:${id}`, cardName(id))) : <p className="muted">{fromDeck.length ? "No card matches." : "Add cards to the deck to use their art."}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small sleeve swatch for a button. */
export function SleeveSwatch({ sleeve }: { sleeve: string | undefined }) {
  return <span className="sl-swatch"><SleeveBack sleeve={sleeve} /></span>;
}
