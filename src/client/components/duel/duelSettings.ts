// Per-browser duel preferences (the ⚙ panel in a duel): 3D tilt, what the board shows, confirmations.
import { useSyncExternalStore } from "react";

export interface DuelSettings {
  /** 3D view: how far the table tilts away from you, in degrees (0 = flat). */
  tilt: number;
  /** ATK / DEF under face-up monsters. */
  stats: boolean;
  /** Battle outcome on each target while choosing an attack target. */
  matchup: boolean;
  /** Ask before ending the turn with an unused Normal Summon. */
  confirmEnd: boolean;
}
export const TILT_MAX = 30;
const DEFAULTS: DuelSettings = { tilt: 20, stats: true, matchup: true, confirmEnd: true };
const KEY = "ygo.duelSettings";

function load(): DuelSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DuelSettings> | null;
    // the old on/off 3D switch
    const legacyOff = localStorage.getItem("ygo.tilt") === "off";
    const s = { ...DEFAULTS, ...(legacyOff ? { tilt: 0 } : {}), ...(raw ?? {}) };
    return { ...s, tilt: Math.min(TILT_MAX, Math.max(0, Number(s.tilt) || 0)) };
  } catch { return DEFAULTS; }
}

let current: DuelSettings = typeof window === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();

export function setDuelSetting<K extends keyof DuelSettings>(k: K, v: DuelSettings[K]) {
  current = { ...current, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}
export const duelSettings = () => current;
export function useDuelSettings(): DuelSettings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => DEFAULTS);
}
