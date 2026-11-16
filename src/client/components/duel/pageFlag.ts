// Flags on the duel page that CSS reacts to ("a reveal is open", "the engine bar shows"...), set by the
// component that knows, while it's mounted. They replace `.duel-page:has(...)` selectors: a :has() on a
// big ancestor makes every DOM change on the page re-check styles (measured ~14 ms per update, vs ~1 ms).
// Data attributes: React doesn't own them, so its re-renders of the page's className keep them.
import { useEffect } from "react";

export function usePageFlag(name: string, on = true) {
  useEffect(() => {
    if (!on) return;
    const el = document.querySelector<HTMLElement>(".duel-page");
    if (!el) return;
    const attr = `data-${name}`;
    el.setAttribute(attr, "");
    return () => { el.removeAttribute(attr); };
  }, [name, on]);
}

/** Page-wide classes on <html> (duel-live, duel-scaled, duel-room) instead of `body:has(.duel-page...)`. */
export function useHtmlClasses(classes: Record<string, boolean>) {
  const key = JSON.stringify(classes);
  useEffect(() => {
    const root = document.documentElement;
    const on = Object.entries(classes).filter(([, v]) => v).map(([k]) => k);
    root.classList.add(...on);
    return () => root.classList.remove(...on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
