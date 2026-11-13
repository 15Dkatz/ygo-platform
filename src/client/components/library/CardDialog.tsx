import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CustomTags, LibraryCard } from "../../../shared/types.ts";
import { REL_LABELS, TAG_HELP } from "../../../shared/library.ts";
import { CardImage } from "../cards/CardImage.tsx";
import { CardPreviewLayer, preview, previewHandlers } from "../cards/CardPreview.tsx";
import { kindLine, statLine, typeLine } from "../cards/cardInfo.ts";
import "./card-dialog.css";
import { CardText } from "../cards/CardText.tsx";

interface Props {
  card: LibraryCard | null;
  byId: Map<number, LibraryCard>;
  library: LibraryCard[];
  deckIds: Map<string, string>; // deck name -> deck id
  customTags: CustomTags;
  allTags: string[];
  onOpen: (card: LibraryCard) => void;
  onClose: () => void;
  onAddTag: (card: LibraryCard, tag: string) => void;
  onRemoveTag: (card: LibraryCard, tag: string) => void;
  onSetTier: (card: LibraryCard, tier: string | null) => void;
}

const SCOPE = "dialog";
const SUPPORT_HEAD: Record<string, string> = {
  generic: "Generic card: no archetype or named companions, so it is playable in any deck.",
  none: "No companions",
  thin: "Few companions",
  good: "Well supported",
};

/** Card detail dialog: big image, stats, tier + why, tags (editable), popularity, banlist, relations, decks. */
export function CardDialog(p: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<LibraryCard[]>([]);
  const [newTag, setNewTag] = useState("");
  const c = p.card;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (c && !d.open) d.showModal();
    if (!c && d.open) d.close();
    if (!c) setHistory([]);
  }, [c]);

  const rel = useMemo(() => {
    if (!c) return null;
    const mates = c.archetype ? p.library.filter((x) => x.archetype === c.archetype && x.id !== c.id) : [];
    const names: LibraryCard[] = [], namedBy: LibraryCard[] = [];
    for (const [id, f] of Object.entries(c.rel_links)) {
      const x = p.byId.get(Number(id));
      if (!x || x.id === c.id) continue;
      if (f & 2) names.push(x);
      if (f & 4) namedBy.push(x);
    }
    const byName = (a: LibraryCard, b: LibraryCard) => a.name.localeCompare(b.name);
    return { mates: mates.sort(byName), names: names.sort(byName), namedBy: namedBy.sort(byName) };
  }, [c, p.library, p.byId]);

  const custom = c ? p.customTags[c.name.toLowerCase()] ?? [] : [];
  const customLower = new Set(custom.map((t) => t.toLowerCase()));
  const myTier = custom.find((t) => t.toLowerCase().startsWith("tier:"))?.split(":")[1]?.trim().toUpperCase() ?? "";

  const go = (x: LibraryCard) => {
    preview.hide();
    if (c) setHistory((h) => [...h, c]);
    p.onOpen(x);
  };
  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    p.onOpen(prev);
  };

  const list = (title: string, cards: LibraryCard[]) =>
    cards.length > 0 && (
      <div className="dlg-rel">
        <b>{title} ({cards.length})</b>
        <div className="dlg-rel-links">
          {cards.slice(0, 60).map((x) => (
            <button key={x.id} type="button" className="linklike" onClick={() => go(x)} {...previewHandlers(x, SCOPE)}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); preview.show(x, r.right, r.bottom, SCOPE); }}
              onBlur={() => preview.hide()}>
              {x.name}
            </button>
          ))}
          {cards.length > 60 && <span className="muted">… and {cards.length - 60} more</span>}
        </div>
      </div>
    );

  return (
    <dialog
      ref={ref}
      className="card-dialog"
      onClose={() => { preview.hide(); p.onClose(); }}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      {c && rel && (
        <div className="dlg-inner">
          <div className="dlg-top">
            {history.length > 0 && <button type="button" onClick={back}>← Back</button>}
            <span className="spacer" />
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close">Close</button>
          </div>
          <div className="dlg-body">
            <div className="dlg-img"><CardImage card={c} size="full" eager /></div>
            <div className="dlg-info">
              <h2>{c.name}</h2>
              <div className="muted">{typeLine(c) || c.category}</div>
              {(kindLine(c) || statLine(c)) && <p>{[kindLine(c), statLine(c), c.scale !== null ? `Scale ${c.scale}` : null].filter(Boolean).join(" · ")}</p>}
              <p>
                Archetype: {c.archetype || "–"}<br />
                Released: TCG {c.tcg_date || "–"} · OCG {c.ocg_date || "–"}<br />
                Copies: <b>{c.copies}</b> in {c.decks.length} deck{c.decks.length === 1 ? "" : "s"} · ID {c.id}
              </p>
              {c.tier && (
                <p>
                  <b className={`tier-badge tier-${c.tier}`}>Tier {c.tier}</b>{" "}
                  <span className="muted">
                    {c.tier_src === "yours" ? "(your tier)" : `(estimated, score ${c.tier_score}${c.tier_conf === "low" ? "; low confidence: no popularity data" : ""})`}
                  </span>
                  <br />
                  <span className="muted">{c.tier_why.join(" · ")}</span>
                </p>
              )}
              <div className="dlg-tags">
                <div className="dlg-tag-list">
                  {c.tags.map((t) => {
                    const mine = customLower.has(t.toLowerCase());
                    return (
                      <span key={t} className={`tag${mine ? " mine" : ""}`} title={TAG_HELP[t] || (mine ? "your tag" : "")}>
                        {t}
                        {mine && !t.toLowerCase().startsWith("tier:") && (
                          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => p.onRemoveTag(c, t)}>×</button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <form className="dlg-tag-form" onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) { p.onAddTag(c, newTag.trim()); setNewTag(""); } }}>
                  <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag…" list="dlg-tag-options" aria-label="New tag" />
                  <datalist id="dlg-tag-options">{p.allTags.map((t) => <option key={t} value={t} />)}</datalist>
                  <button type="submit" disabled={!newTag.trim()}>Add</button>
                  <select value={myTier} onChange={(e) => p.onSetTier(c, e.target.value || null)} aria-label="Your tier">
                    <option value="">Tier: estimated</option>
                    {["S", "A", "B", "C", "D"].map((t) => <option key={t} value={t}>My tier: {t}</option>)}
                  </select>
                </form>
              </div>
              <p>
                Popularity: {c.views !== null ? `${c.views.toLocaleString()} views (${(c.viewsweek || 0).toLocaleString()} this week)` : "n/a"}
                {c.upvotes !== null && <span className="muted"> · {c.upvotes} up / {c.downvotes ?? 0} down votes</span>}
                <br />
                Banlist: TCG {c.ban_tcg || "–"} · OCG {c.ban_ocg || "–"}
              </p>
              {c.rel_status !== "unknown" && (
                <>
                  <p><b className={`support support-${c.rel_status}`}>
                    {c.rel_status === "generic" ? SUPPORT_HEAD.generic : `${c.related} related card${c.related === 1 ? "" : "s"} in your library · ${REL_LABELS[c.rel_status]}`}
                  </b></p>
                  {list(`Same archetype: ${c.archetype}`, rel.mates)}
                  {list("Cards this card names", rel.names)}
                  {list("Cards that name this card", rel.namedBy)}
                </>
              )}
              <div className="dlg-decks">
                <b>In decks</b>
                <ul>
                  {c.decks.map((d) => {
                    const id = p.deckIds.get(d);
                    const date = c.deck_dates[d]?.modified;
                    return (
                      <li key={d}>
                        {id ? <Link to={`/decks/${id}`}>{d}</Link> : d}{" "}
                        <span className="muted">(×{c.deck_counts[d]}{date ? `, file ${date}` : ""})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <CardText className="dlg-text" text={c.desc ?? ""} />
            </div>
          </div>
          <CardPreviewLayer scope={SCOPE} />
        </div>
      )}
    </dialog>
  );
}
