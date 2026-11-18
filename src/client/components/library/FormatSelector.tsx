import { useSyncExternalStore } from "react";
import { FORMAT_LABEL, type DeckFormat } from "../../../shared/formats.ts";

const KEY = "ygo.banFormat";
const EVENT = "ygo:format-changed";
function read(): DeckFormat {
  try { const value = localStorage.getItem(KEY); if (value && value in FORMAT_LABEL) return value as DeckFormat; } catch { /* storage blocked */ }
  return "genesys";
}
let fallback: DeckFormat | null = null;
function subscribe(on: () => void) {
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
}
export function useDeckFormat() {
  const format = useSyncExternalStore(subscribe, () => fallback ?? read(), () => "genesys" as DeckFormat);
  const setFormat = (value: DeckFormat) => {
    try { localStorage.setItem(KEY, value); fallback = null; } catch { fallback = value; }
    window.dispatchEvent(new Event(EVENT));
  };
  return [format, setFormat] as const;
}
export function FormatSelector({ format, onChange }: { format: DeckFormat; onChange(value: DeckFormat): void }) {
  return <label className="muted">Format {" "}<select aria-label="Deck format" value={format} onChange={(e) => onChange(e.target.value as DeckFormat)}>
    {(Object.keys(FORMAT_LABEL) as DeckFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
  </select></label>;
}
