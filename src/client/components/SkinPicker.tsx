import { SKINS, setSkin, useSkin, type SkinId } from "../skins.ts";

/** A small theme select (top bar, and the duel's top line where the site header is hidden). */
export function SkinPicker({ className = "" }: { className?: string }) {
  const skin = useSkin();
  return (
    <label className={`skin-picker ${className}`} title={SKINS.find((s) => s.id === skin)?.hint}>
      <span className="skin-picker-icon" aria-hidden="true">◐</span>
      <select value={skin} onChange={(e) => setSkin(e.target.value as SkinId)} aria-label="Theme">
        {SKINS.map((s) => <option key={s.id} value={s.id} title={s.hint}>{s.label}</option>)}
      </select>
    </label>
  );
}
