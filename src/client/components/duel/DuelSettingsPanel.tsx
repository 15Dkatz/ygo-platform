import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AUTO_PASS_LABEL, type AutoPassMode } from "../../../shared/autoPass.ts";
import { getVolume, isMuted, onMuteChange, play, setMuted, setVolume } from "./anim/sfx.ts";
import { TILT_MAX, setDuelSetting, useDuelSettings } from "./duelSettings.ts";

/** ⚙ in the duel's top line: sliders and switches for the view, sound and what the duel asks you. */
export function DuelSettingsButton({ autoPass, setAutoPass, engine }: { autoPass: AutoPassMode; setAutoPass(m: AutoPassMode): void; engine: boolean }) {
  const [open, setOpen] = useState(false);
  const s = useDuelSettings();
  const muted = useSyncExternalStore(onMuteChange, isMuted, isMuted);
  const volume = useSyncExternalStore(onMuteChange, getVolume, getVolume);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div className="duel-settings" ref={ref}>
      <button className={`duel-help-btn ${open ? "is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Duel settings" title="Duel settings">⚙</button>
      {open && (
        <div className="duel-settings-panel" role="dialog" aria-label="Duel settings">
          <h3>Duel settings</h3>

          <label className="duel-setting">
            <span>3D tilt <b>{s.tilt ? `${s.tilt}°` : "Flat"}</b></span>
            <input type="range" min={0} max={TILT_MAX} step={1} value={s.tilt} onChange={(e) => setDuelSetting("tilt", Number(e.target.value))} aria-label="3D tilt" />
          </label>

          <label className="duel-setting">
            <span>Volume <b>{muted ? "Muted" : `${Math.round(volume * 100)}%`}</b></span>
            <span className="duel-setting-row">
              <button className="duel-setting-mute" onClick={(e) => { e.preventDefault(); setMuted(!muted); }} aria-pressed={muted} title={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</button>
              <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={muted}
                onChange={(e) => setVolume(Number(e.target.value) / 100)} onPointerUp={() => play("pick")} aria-label="Volume" />
            </span>
          </label>

          {engine && (
            <label className="duel-setting">
              <span>Chain prompts</span>
              <select value={autoPass} onChange={(e) => setAutoPass(e.target.value as AutoPassMode)} aria-label="Auto-pass chains">
                {(Object.keys(AUTO_PASS_LABEL) as AutoPassMode[]).map((m) => <option key={m} value={m}>{AUTO_PASS_LABEL[m]}</option>)}
              </select>
              <small className="muted">Smart: only stops when your opponent does something. Your monsters' effects always ask.</small>
            </label>
          )}

          <Toggle label="ATK / DEF under monsters" on={s.stats} set={(v) => setDuelSetting("stats", v)} />
          {engine && <Toggle label="Attack outcome preview" on={s.matchup} set={(v) => setDuelSetting("matchup", v)} />}
          {engine && <Toggle label="Confirm before ending the turn with an unused Normal Summon" on={s.confirmEnd} set={(v) => setDuelSetting("confirmEnd", v)} />}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set(v: boolean): void }) {
  return (
    <label className="duel-toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="duel-toggle-track" aria-hidden="true"><i /></span>
      <span>{label}</span>
    </label>
  );
}
