import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { Card } from "../../../shared/types.ts";
import { getFacets, searchCards, type Facets } from "../../api.ts";
import { CardImage } from "./CardImage.tsx";
import { previewHandlers } from "./CardPreview.tsx";
import { catalog } from "./catalog.ts";
import { banLimit } from "./cardInfo.ts";
import "./card-search.css";

export const CARD_DRAG_TYPE = "application/x-ygo-card";

interface Props {
  /** Left click / Enter on a result. */
  onPick: (card: Card) => void;
  /** Right click on a result (e.g. add to Side Deck). */
  onPickAlt?: (card: Card) => void;
  /** Copies already used, to show a count badge on results. */
  countOf?: (id: number) => number;
}

interface Query {
  q: string; text: boolean; category: string; kind: string; attribute: string; race: string; archetype: string;
  level: string; atk_min: string; atk_max: string; def_min: string; def_max: string; ban: string; sort: string; dir: string;
}
const EMPTY: Query = {
  q: "", text: false, category: "", kind: "", attribute: "", race: "", archetype: "", level: "",
  atk_min: "", atk_max: "", def_min: "", def_max: "", ban: "", sort: "name", dir: "asc",
};
const PAGE = 60;
let facetsCache: Promise<Facets> | null = null;

/** Catalogue search (/api/cards/search) with filters and infinite scroll. Results are draggable. */
export function CardSearchPanel({ onPick, onPickAlt, countOf }: Props) {
  const [query, setQuery] = useState<Query>(EMPTY);
  const [debounced, setDebounced] = useState<Query>(EMPTY);
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [more, setMore] = useState(false);
  const reqId = useRef(0);
  const shownQuery = useRef<Query | null>(null); // query the current `cards` belong to
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    facetsCache ??= getFacets();
    facetsCache.then(setFacets).catch(() => { facetsCache = null; });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const params = (q: Query, offset: number) => ({
    ...q, text: q.text ? "1" : undefined, sort: q.sort, dir: q.dir, limit: PAGE, offset,
  });

  // new query -> first page
  useEffect(() => {
    const id = ++reqId.current;
    shownQuery.current = null;
    setLoading(true);
    setError(null);
    searchCards(params(debounced, 0))
      .then((r) => {
        if (id !== reqId.current) return;
        catalog.remember(r.cards);
        shownQuery.current = debounced;
        setCards(r.cards);
        setTotal(r.total);
        scrollRef.current?.scrollTo({ top: 0 });
      })
      .catch((e) => id === reqId.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => id === reqId.current && setLoading(false));
  }, [debounced]);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setMore(entries.some((e) => e.isIntersecting)), { root: scrollRef.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    // only page the results that belong to the current query, and only while the end is near
    if (!more || loading || cards.length >= total || shownQuery.current !== debounced) return;
    const root = scrollRef.current, end = sentinelRef.current;
    if (!root || !end || root.clientHeight === 0) return;
    if (end.getBoundingClientRect().top - root.getBoundingClientRect().bottom > 400) return;
    const id = ++reqId.current;
    setLoading(true);
    searchCards(params(debounced, cards.length))
      .then((r) => {
        if (id !== reqId.current) return;
        catalog.remember(r.cards);
        setCards((prev) => [...prev, ...r.cards.filter((c) => !prev.some((p) => p.id === c.id))]);
        setTotal(r.total);
      })
      .catch((e) => id === reqId.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => id === reqId.current && setLoading(false));
  }, [more, loading, cards.length, total, debounced]);

  const set = <K extends keyof Query>(k: K, v: Query[K]) => setQuery((q) => ({ ...q, [k]: v }));
  const isMonster = !query.category || query.category === "Monster";
  const dragStart = (e: DragEvent, c: Card) => {
    e.dataTransfer.setData(CARD_DRAG_TYPE, JSON.stringify({ id: c.id }));
    e.dataTransfer.setData("text/plain", c.name);
    e.dataTransfer.effectAllowed = "copy";
  };
  const alt = (e: MouseEvent, c: Card) => {
    if (!onPickAlt) return;
    e.preventDefault();
    onPickAlt(c);
  };

  return (
    <div className="card-search">
      <div className="cs-filters">
        <div className="cs-row">
          <input type="search" placeholder={query.text ? "Search name, text, archetype…" : "Search card name…"} value={query.q}
            onChange={(e) => set("q", e.target.value)} aria-label="Search cards" className="cs-q" />
          <label className="cs-check" title="Also search card text and archetype">
            <input type="checkbox" checked={query.text} onChange={(e) => set("text", e.target.checked)} /> text
          </label>
        </div>
        <details className="cs-more">
          <summary>Filters{countActive(query) ? ` (${countActive(query)})` : ""}</summary>
          <div className="cs-grid">
            <select value={query.category} onChange={(e) => set("category", e.target.value)} aria-label="Category">
              <option value="">Any category</option>
              <option>Monster</option><option>Spell</option><option>Trap</option>
            </select>
            <select value={query.kind} onChange={(e) => set("kind", e.target.value)} aria-label="Kind">
              <option value="">Any kind</option>
              {facets?.kind.map((k) => <option key={k}>{k}</option>)}
            </select>
            {isMonster && (
              <>
                <select value={query.attribute} onChange={(e) => set("attribute", e.target.value)} aria-label="Attribute">
                  <option value="">Any attribute</option>
                  {facets?.attribute.map((k) => <option key={k}>{k}</option>)}
                </select>
                <select value={query.race} onChange={(e) => set("race", e.target.value)} aria-label="Type / race">
                  <option value="">Any type</option>
                  {facets?.race.map((k) => <option key={k}>{k}</option>)}
                </select>
              </>
            )}
            <input list="cs-archetypes" placeholder="Archetype" value={query.archetype} onChange={(e) => set("archetype", e.target.value)} aria-label="Archetype" />
            <datalist id="cs-archetypes">{facets?.archetype.map((a) => <option key={a} value={a} />)}</datalist>
            {isMonster && (
              <>
                <input type="number" min={0} max={13} placeholder="Level / Rank / Link" value={query.level} onChange={(e) => set("level", e.target.value)} aria-label="Level" />
                <span className="cs-range">
                  <input type="number" step={100} min={0} placeholder="ATK ≥" value={query.atk_min} onChange={(e) => set("atk_min", e.target.value)} aria-label="ATK min" />
                  <input type="number" step={100} min={0} placeholder="ATK ≤" value={query.atk_max} onChange={(e) => set("atk_max", e.target.value)} aria-label="ATK max" />
                </span>
                <span className="cs-range">
                  <input type="number" step={100} min={0} placeholder="DEF ≥" value={query.def_min} onChange={(e) => set("def_min", e.target.value)} aria-label="DEF min" />
                  <input type="number" step={100} min={0} placeholder="DEF ≤" value={query.def_max} onChange={(e) => set("def_max", e.target.value)} aria-label="DEF max" />
                </span>
              </>
            )}
            <select value={query.ban} onChange={(e) => set("ban", e.target.value)} aria-label="Banlist">
              <option value="">Any banlist status</option>
              <option value="tcg-forbidden">TCG Forbidden</option>
              <option value="tcg-limited">TCG Limited</option>
              <option value="tcg-semi-limited">TCG Semi-Limited</option>
              <option value="ocg-forbidden">OCG Forbidden</option>
              <option value="ocg-limited">OCG Limited</option>
              <option value="ocg-semi-limited">OCG Semi-Limited</option>
            </select>
            <span className="cs-range">
              <select value={query.sort} onChange={(e) => set("sort", e.target.value)} aria-label="Sort">
                <option value="name">Name</option><option value="date">Release date</option><option value="atk">ATK</option>
                <option value="def">DEF</option><option value="level">Level</option><option value="views">Popularity</option>
              </select>
              <select value={query.dir} onChange={(e) => set("dir", e.target.value)} aria-label="Sort direction">
                <option value="asc">asc</option><option value="desc">desc</option>
              </select>
            </span>
            <button type="button" onClick={() => setQuery(EMPTY)}>Clear</button>
          </div>
        </details>
        <div className="cs-status muted" aria-live="polite">
          {error ? <span className="cs-error">{error}</span> : `${total.toLocaleString()} card${total === 1 ? "" : "s"}`}
          {onPickAlt && <span className="cs-hint"> · click: add · right-click: add to Side · or drag</span>}
        </div>
      </div>
      <div className="cs-results" ref={scrollRef}>
        <div className="cs-list">
          {cards.map((c) => {
            const used = countOf?.(c.id) ?? 0;
            const lim = banLimit(c.ban_tcg);
            return (
              <button key={c.id} type="button" className="cs-card" draggable onDragStart={(e) => dragStart(e, c)}
                onClick={() => onPick(c)} onContextMenu={(e) => alt(e, c)} {...previewHandlers(c)} title={c.name}>
                <CardImage card={c} />
                {lim < 3 && <span className={`cs-ban ban-${lim}`}>{lim}</span>}
                {used > 0 && <span className="cs-used">×{used}</span>}
                <span className="cs-name">{c.name}</span>
              </button>
            );
          })}
        </div>
        <div ref={sentinelRef} className="cs-sentinel">{loading ? "Loading…" : cards.length >= total ? (total ? "End of results" : "No cards found") : ""}</div>
      </div>
    </div>
  );
}

function countActive(q: Query) {
  return (["category", "kind", "attribute", "race", "archetype", "level", "atk_min", "atk_max", "def_min", "def_max", "ban"] as const).filter((k) => q[k]).length;
}
