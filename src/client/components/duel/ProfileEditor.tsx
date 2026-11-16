// Edit your duelist profile: an avatar (a card's art), a title and a showcase card. Choices: popular cards and
// the cards in your decks (filterable).
import { useEffect, useMemo, useState } from "react";
import type { Deck } from "../../../shared/types.ts";
import { POPULAR_SLEEVES } from "../../../shared/sleeves.ts";
import { cardImage } from "../../api.ts";
import { useCardData } from "./useDuel.ts";
import { avatarStyle, setProfile, useProfile } from "./profileStore.ts";
import "./profile.css";

export function ProfileEditor({ name, decks, onClose }: { name: string; decks: Deck[] | null; onClose(): void }) {
  const saved = useProfile();
  const [p, setP] = useState(saved);
  const [pick, setPick] = useState<"avatar" | "showcase">("avatar");
  const [q, setQ] = useState("");
  const codes = useMemo(() => {
    const fromDecks = [...new Set((decks ?? []).flatMap((d) => [...d.main, ...d.extra]))];
    return [...POPULAR_SLEEVES.map((c) => c.code), ...fromDecks.filter((c) => !POPULAR_SLEEVES.some((x) => x.code === c))];
  }, [decks]);
  const card = useCardData(codes);
  const shown = codes.filter((c) => !q || (card(c)?.name ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 160);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  const save = () => { setProfile(p); onClose(); };

  return (
    <div className="th-backdrop" onClick={onClose}>
      <div className="th-dialog pf-dialog" role="dialog" aria-modal="true" aria-label="Your duelist profile" onClick={(e) => e.stopPropagation()}>
        <div className="th-head"><h2>Your duelist profile</h2><button type="button" className="th-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="pf-body">
          <div className="pf-preview">
            <span className="pf-avatar is-big" style={avatarStyle(p)}>{p.avatar ? "" : (name[0] ?? "?").toUpperCase()}</span>
            <b>{name}</b>
            <input value={p.title ?? ""} maxLength={28} placeholder="A title (e.g. Kewl Tune enjoyer)" onChange={(e) => setP({ ...p, title: e.target.value })} aria-label="Title" />
            <span className="pf-show">{p.showcase ? <img src={cardImage(p.showcase, "small")} alt={card(p.showcase)?.name ?? ""} /> : <i>No showcase card</i>}</span>
            <small className="muted">Everyone in your duel rooms sees this.</small>
            <div className="pf-actions">
              <button type="button" onClick={() => setP({})}>Reset</button>
              <button type="button" className="primary" onClick={save}>Save</button>
            </div>
          </div>
          <div className="pf-pick">
            <div className="pf-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={pick === "avatar"} className={pick === "avatar" ? "is-on" : ""} onClick={() => setPick("avatar")}>Avatar</button>
              <button type="button" role="tab" aria-selected={pick === "showcase"} className={pick === "showcase" ? "is-on" : ""} onClick={() => setPick("showcase")}>Showcase card</button>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" aria-label="Filter cards" />
            </div>
            <div className="pf-grid">
              {shown.map((c) => {
                const on = pick === "avatar" ? p.avatar === c : p.showcase === c;
                return (
                  <button key={c} type="button" className={`pf-choice ${pick} ${on ? "is-on" : ""}`} title={card(c)?.name ?? String(c)}
                    onClick={() => setP(pick === "avatar" ? { ...p, avatar: c } : { ...p, showcase: c })}>
                    {pick === "avatar" ? <span className="pf-avatar" style={avatarStyle({ avatar: c })} /> : <img src={cardImage(c, "small")} alt="" loading="lazy" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
