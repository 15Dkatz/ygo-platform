// Your duelist profile (avatar card, title, showcase card), kept in this browser and sent when you take a seat.
import { useSyncExternalStore } from "react";
import { cleanProfile, type Profile } from "../../../shared/profile.ts";
import { cardImage } from "../../api.ts";

const KEY = "ygo.profile";
const listeners = new Set<() => void>();
let current: Profile = (() => { try { return cleanProfile(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? {}; } catch { return {}; } })();

export const getProfile = () => current;
export function setProfile(p: Profile) {
  current = cleanProfile(p) ?? {};
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}
export function useProfile(): Profile {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => current);
}

/** The avatar as a CSS background (the card's art), or undefined for the default letter. */
export const avatarStyle = (p?: Profile) => (p?.avatar ? { backgroundImage: `url("${cardImage(p.avatar, "crop")}")` } : undefined);
