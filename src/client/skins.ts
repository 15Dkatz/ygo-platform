// Visual themes ("skins"): whole-site looks (textures, fonts, card backs, the duel table), picked by
// the user and remembered in this browser. The CSS lives in skins.css, keyed on <html data-skin="…">.
import { useSyncExternalStore } from "react";

export const SKINS = [
  { id: "arcane", label: "Arcane", hint: "Glowing mystic duel arena (default)" },
  { id: "vintage", label: "Vintage", hint: "Aged parchment on a wooden table, serif type" },
  { id: "felt", label: "Card table", hint: "Green felt, mahogany rail, brass" },
  { id: "stone", label: "Ancient stone", hint: "Carved stone slab, gold engravings" },
] as const;
export type SkinId = (typeof SKINS)[number]["id"];

const KEY = "ygo.skin";
const listeners = new Set<() => void>();

function read(): SkinId {
  try {
    const v = localStorage.getItem(KEY);
    if (SKINS.some((s) => s.id === v)) return v as SkinId;
  } catch { /* storage blocked */ }
  return "arcane";
}

let current: SkinId = typeof window === "undefined" ? "arcane" : read();

/** Put the saved skin on <html> (call once before the first render, so there's no flash). */
export function applySkin(id: SkinId = current) {
  current = id;
  if (typeof document !== "undefined") {
    if (id === "arcane") delete document.documentElement.dataset.skin;
    else document.documentElement.dataset.skin = id;
  }
}

export function setSkin(id: SkinId) {
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked: still applies for this visit */ }
  applySkin(id);
  listeners.forEach((l) => l());
}

export function useSkin(): SkinId {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => current);
}
