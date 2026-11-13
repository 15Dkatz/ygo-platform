import { useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent } from "react";
import type { Card, LibraryCard } from "../../../shared/types.ts";
import { CardImage } from "./CardImage.tsx";
import { kindLine, statLine, typeLine } from "./cardInfo.ts";
import "./cards.css";
import { CardText } from "./CardText.tsx";

/**
 * Hover preview of a card (big image + text) that follows the mouse.
 * Render <CardPreviewLayer /> once per page and spread `previewHandlers(card)` on anything
 * that should show a preview. Touch devices (no hover) never show it.
 */
type Previewable = Card | LibraryCard;
interface State { card: Previewable | null; x: number; y: number; scope: string }

let state: State = { card: null, x: 0, y: 0, scope: "page" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const canHover = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;

export const preview = {
  /** `scope` picks which layer draws it (a modal <dialog> needs its own layer inside it). */
  show(card: Previewable, x: number, y: number, scope = "page") {
    if (!canHover()) return;
    state = { card, x, y, scope };
    emit();
  },
  move(x: number, y: number) {
    if (!state.card) return;
    state = { ...state, x, y };
    emit();
  },
  hide() {
    if (!state.card) return;
    state = { card: null, x: 0, y: 0, scope: "page" };
    emit();
  },
};

export function previewHandlers(card: Previewable, scope = "page") {
  return {
    onMouseEnter: (e: MouseEvent) => preview.show(card, e.clientX, e.clientY, scope),
    onMouseMove: (e: MouseEvent) => preview.move(e.clientX, e.clientY),
    onMouseLeave: () => preview.hide(),
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function CardPreviewLayer({ scope = "page" }: { scope?: string }) {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !s.card || s.scope !== scope) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = s.x + 16, y = s.y + 16;
    if (x + w > innerWidth - 8) x = Math.max(8, s.x - w - 16);
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    el.style.transform = `translate(${x}px, ${y}px)`;
  });
  useLayoutEffect(() => {
    const hide = () => preview.hide();
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, []);
  const c = s.card;
  if (!c || s.scope !== scope) return null;
  const lib = "tier" in c ? (c as LibraryCard) : null;
  const text = c.desc || "";
  return (
    <div className="card-preview" ref={ref} role="tooltip">
      <CardImage card={c} size="small" eager />
      <div className="card-preview-body">
        <strong>{c.name}</strong>
        {lib?.tier && <span className={`tier-badge tier-${lib.tier}`}>Tier {lib.tier}</span>}
        <p className="muted">{typeLine(c)}</p>
        <p className="muted">{[kindLine(c), statLine(c)].filter(Boolean).join(" · ")}</p>
        {lib && lib.tags.length > 0 && <p className="muted small">{lib.tags.join(" · ")}</p>}
        <CardText className="card-preview-text" text={text.length > 520 ? text.slice(0, 520) + "…" : text} />
      </div>
    </div>
  );
}
