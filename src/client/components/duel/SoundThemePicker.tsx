// Pick the sound theme (duel settings, the room's "Your duel view", the summon lab): plays a short sample.
import { useSyncExternalStore } from "react";
import { SOUND_THEMES, SOUND_THEME_LABEL, getSoundTheme, onMuteChange, play, setSoundTheme, type SoundTheme } from "./anim/sfx.ts";

export function SoundThemePicker({ className = "duel-setting" }: { className?: string }) {
  const theme = useSyncExternalStore(onMuteChange, getSoundTheme, getSoundTheme);
  const sample = () => { play("sum-synchro"); play("act-trap", { inMs: 900 }); play("chain-link", { link: 2, inMs: 1500 }); };
  return (
    <label className={className}>
      <span>Sound theme</span>
      <span className="duel-setting-row">
        <select value={theme} onChange={(e) => { setSoundTheme(e.target.value as SoundTheme); sample(); }} aria-label="Sound theme">
          {SOUND_THEMES.map((t) => <option key={t} value={t}>{SOUND_THEME_LABEL[t]}</option>)}
        </select>
        <button type="button" onClick={(e) => { e.preventDefault(); sample(); }} title="Hear a sample" aria-label="Hear a sample">▶</button>
      </span>
    </label>
  );
}
