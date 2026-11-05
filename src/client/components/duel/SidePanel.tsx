import { useEffect, useRef, useState, type FormEvent } from "react";
import { cardImage } from "../../api.ts";
import type { ChatLine } from "./useDuel.ts";
import { getCard } from "./useDuel.ts";

/** Big card preview with its text. */
export function CardPreview({ code }: { code: number | null }) {
  const card = code ? getCard(code) : null;
  if (!code || code <= 0) return <div className="duel-preview is-empty muted">Hover a card to see it here.</div>;
  const stats = card && card.category === "Monster"
    ? [card.attribute, card.race, card.linkval ? `LINK-${card.linkval}` : card.level ? `${/XYZ/i.test(card.type ?? "") ? "Rank" : "Level"} ${card.level}` : null, card.scale != null ? `Scale ${card.scale}` : null].filter(Boolean).join(" · ")
    : card ? [card.race, card.category].filter(Boolean).join(" ") : "";
  return (
    <div className="duel-preview">
      <img src={cardImage(code, "full")} alt={card?.name ?? ""} />
      <div className="duel-preview-text">
        <h3>{card?.name ?? `Card ${code}`}</h3>
        {card && <div className="muted">{card.type}{stats ? ` — ${stats}` : ""}</div>}
        {card && card.category === "Monster" && (
          <div className="duel-preview-atk">ATK {card.atk ?? "?"}{card.linkval ? "" : ` / DEF ${card.defense ?? "?"}`}</div>
        )}
        {card?.desc && <p>{card.desc}</p>}
      </div>
    </div>
  );
}

/** Renders a log line, turning [[code]] tokens into hoverable card names. */
export function LogText({ text, onHover }: { text: string; onHover(code: number | null): void }) {
  const parts = text.split(/(\[\[\d+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[\[(\d+)\]\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const code = Number(m[1]);
        return <b key={i} className="duel-log-card" onMouseEnter={() => onHover(code)} onClick={() => onHover(code)}>{getCard(code)?.name ?? `#${code}`}</b>;
      })}
    </>
  );
}

export function LogChat({ log, chat, canChat, onChat, onHover, initialTab = "log" }: { log: string[]; chat: ChatLine[]; canChat: boolean; onChat(text: string): void; onHover(code: number | null): void; initialTab?: "log" | "chat" }) {
  const [tab, setTab] = useState<"log" | "chat">(initialTab);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastChat = useRef(chat.length);

  useEffect(() => {
    if (tab !== "chat" && chat.length > lastChat.current && !chat[chat.length - 1]?.system) setUnread((u) => u + 1);
    lastChat.current = chat.length;
  }, [chat, tab]);
  useEffect(() => { if (tab === "chat") setUnread(0); }, [tab]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, chat.length, tab]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onChat(text);
    setText("");
  };

  return (
    <div className="duel-logchat">
      <div className="duel-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "log"} className={tab === "log" ? "is-active" : ""} onClick={() => setTab("log")}>Duel log</button>
        <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")}>
          Chat{unread ? <span className="duel-unread">{unread}</span> : null}
        </button>
      </div>
      <div className="duel-loglist" ref={listRef}>
        {tab === "log"
          ? log.map((l, i) => <div key={i} className="duel-logline"><LogText text={l} onHover={onHover} /></div>)
          : chat.map((c, i) => (
            <div key={i} className={`duel-chatline ${c.system ? "is-system" : ""}`}>
              {!c.system && <b>{c.from}: </b>}<span>{c.text}</span>
            </div>
          ))}
        {tab === "log" && !log.length && <div className="muted">The duel log appears here.</div>}
        {tab === "chat" && !chat.length && <div className="muted">No messages yet.</div>}
      </div>
      {tab === "chat" && (
        <form className="duel-chatform" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={canChat ? "Say something…" : "Pick a name in the lobby to chat"} disabled={!canChat} maxLength={300} aria-label="Chat message" />
          <button type="submit" disabled={!canChat || !text.trim()}>Send</button>
        </form>
      )}
    </div>
  );
}
