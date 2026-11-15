import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AUTO_PASS_LABEL, type AutoPassMode } from "../../../shared/autoPass.ts";
import { getVolume, isMuted, onMuteChange, play, setMuted, setVolume } from "./anim/sfx.ts";
import { RESOLVE_COLORS, RESOLVE_COLOR_LABEL, RESOLVE_FX, RESOLVE_FX_LABEL, type ResolveColor, type ResolveFx, SUMMON_FX, SUMMON_FX_LABEL, SPLASH_STYLES, SPLASH_STYLE_LABEL, type SplashStyle, type SummonFxMode } from "./duelSettings.ts";
import { DEFAULT_SCALE, DEFAULT_TILT, LAYOUT, SCALE_RANGE, TILT_MAX, setDuelSetting, useDuelSettings, type DuelSettings, type LayoutKey } from "./duelSettings.ts";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Every slider in the Layout section, in order: [setting, label, min, max, step, shown value, default]. */
type Slider = { key: "tilt" | "fieldScale" | "handScale" | LayoutKey; label: string; min: number; max: number; step: number; show(v: number): string; def: number };
const L = (k: LayoutKey, label: string, show: (v: number) => string): Slider => ({ key: k, label, ...LAYOUT[k], show });
const SLIDERS: { group: string; items: Slider[] }[] = [
  { group: "Table", items: [
    { key: "tilt", label: "3D tilt", min: 0, max: TILT_MAX, step: 1, show: (v) => (v ? `${v}°` : "Flat"), def: DEFAULT_TILT },
    L("camera", "Camera distance", (v) => `${v}px`),
    L("cameraY", "Camera height", (v) => `${v}%`),
    { key: "fieldScale", label: "Field size", min: SCALE_RANGE.field[0], max: SCALE_RANGE.field[1], step: 0.05, show: pct, def: DEFAULT_SCALE.field },
    L("fieldY", "Field up / down", (v) => (v === 0 ? "0" : `${v > 0 ? "↓" : "↑"} ${Math.abs(v).toFixed(2)}`)),
  ] },
  { group: "Hands", items: [
    { key: "handScale", label: "Your hand size", min: SCALE_RANGE.hand[0], max: SCALE_RANGE.hand[1], step: 0.05, show: pct, def: DEFAULT_SCALE.hand },
    L("handDrop", "Your hand: how low", (v) => `${v}%`),
    L("oppHandScale", "Their hand size", pct),
    L("oppHandDrop", "Their hand: how high", (v) => `${v}%`),
  ] },
  { group: "Card preview", items: [
    L("previewScale", "Hover preview size", pct),
  ] },
];

/** ⚙ in the duel's top line: Layout (camera, sizes, positions), Sound, Gameplay and Display. */
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

  const all = SLIDERS.flatMap((g) => g.items);
  const changed = all.some((x) => s[x.key] !== x.def);
  const resetLayout = () => all.forEach((x) => setDuelSetting(x.key, x.def as DuelSettings[typeof x.key]));

  return (
    <div className="duel-settings" ref={ref}>
      <button className={`duel-help-btn ${open ? "is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Duel settings" title="Duel settings">⚙</button>
      {open && (
        <div className="duel-settings-panel" role="dialog" aria-label="Duel settings">
          <h3>Duel settings</h3>

          <Section title="Layout" id="layout" defaultOpen>
            {SLIDERS.map((g) => (
              <Section key={g.group} title={g.group} id={`layout-${g.group}`} defaultOpen={g.group === "Table"} sub>
                {g.items.map((x) => (
                  <label key={x.key} className="duel-setting">
                    <span>{x.label} <b>{x.show(s[x.key])}</b></span>
                    <input type="range" min={x.min} max={x.max} step={x.step} value={s[x.key]} aria-label={x.label}
                      onChange={(e) => setDuelSetting(x.key, Number(e.target.value))} onDoubleClick={() => setDuelSetting(x.key, x.def)} />
                  </label>
                ))}
              </Section>
            ))}
            <span className="duel-setting-row">
              <button className="duel-setting-reset" disabled={!changed} onClick={resetLayout} title="Back to the default layout">Reset layout</button>
              <CopySettings />
            </span>
            <small className="muted">Double-click a slider to reset just that one.</small>
          </Section>

          <Section title="Animations" id="anim">
            <label className="duel-setting">
              <span>Summons and activations</span>
              <select value={s.summonFx} onChange={(e) => setDuelSetting("summonFx", e.target.value as SummonFxMode)} aria-label="Summon and activation animations">
                {SUMMON_FX.map((f) => <option key={f} value={f}>{SUMMON_FX_LABEL[f]}</option>)}
              </select>
            </label>
            <label className="duel-setting">
              <span>Summons shown as</span>
              <select value={s.summonSplash} onChange={(e) => setDuelSetting("summonSplash", e.target.value as SplashStyle)} aria-label="Summons shown as">
                {SPLASH_STYLES.map((f) => <option key={f} value={f}>{SPLASH_STYLE_LABEL[f]}</option>)}
              </select>
            </label>
            <label className="duel-setting">
              <span>Activations shown as</span>
              <select value={s.activateSplash} onChange={(e) => setDuelSetting("activateSplash", e.target.value as SplashStyle)} aria-label="Activations shown as">
                {SPLASH_STYLES.map((f) => <option key={f} value={f}>{SPLASH_STYLE_LABEL[f]}</option>)}
              </select>
            </label>
            <label className="duel-setting">
              <span>Resolving card</span>
              <select value={s.resolveFx} onChange={(e) => setDuelSetting("resolveFx", e.target.value as ResolveFx)} aria-label="Resolving card effect">
                {RESOLVE_FX.map((f) => <option key={f} value={f}>{RESOLVE_FX_LABEL[f]}</option>)}
              </select>
            </label>
            <div className="duel-setting">
              <span>Its colour</span>
              <span className="duel-swatches" role="radiogroup" aria-label="Resolving card colour">
                {RESOLVE_COLORS.map((c) => (
                  <button key={c} role="radio" aria-checked={s.resolveColor === c} title={RESOLVE_COLOR_LABEL[c]}
                    className={`duel-swatch sw-${c} ${s.resolveColor === c ? "is-on" : ""}`} onClick={() => setDuelSetting("resolveColor", c as ResolveColor)} />
                ))}
              </span>
            </div>
            <Toggle label={'"Chain?" / "Your move" callouts'} on={s.callouts} set={(v) => setDuelSetting("callouts", v)} />
            <Toggle label="Screen-edge flashes (damage, heals, callouts)" on={s.edgeFlash} set={(v) => setDuelSetting("edgeFlash", v)} />
            <Toggle label="Turn sign glow" on={s.heartbeat} set={(v) => setDuelSetting("heartbeat", v)} />
            <Toggle label="Shimmer on the zone labels" on={s.labelShimmer} set={(v) => setDuelSetting("labelShimmer", v)} />
          </Section>

          <Section title="Sound" id="sound">
            <label className="duel-setting">
              <span>Volume <b>{muted ? "Muted" : `${Math.round(volume * 100)}%`}</b></span>
              <span className="duel-setting-row">
                <button className="duel-setting-mute" onClick={(e) => { e.preventDefault(); setMuted(!muted); }} aria-pressed={muted} title={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</button>
                <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={muted}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)} onPointerUp={() => play("pick")} aria-label="Volume" />
              </span>
            </label>
          </Section>

          {engine && (
            <Section title="Gameplay" id="gameplay">
              <label className="duel-setting">
                <span>Chain prompts</span>
                <select value={autoPass} onChange={(e) => setAutoPass(e.target.value as AutoPassMode)} aria-label="Auto-pass chains">
                  {(Object.keys(AUTO_PASS_LABEL) as AutoPassMode[]).map((m) => <option key={m} value={m}>{AUTO_PASS_LABEL[m]}</option>)}
                </select>
                <small className="muted">Smart: only stops when your opponent does something. Your monsters' effects always ask.</small>
              </label>
              <Toggle label="Pick zones for me (drag a card onto a zone to choose one)" on={s.autoPlace} set={(v) => setDuelSetting("autoPlace", v)} />
              <Toggle label="Drag a monster onto a target to attack" on={s.dragAttack} set={(v) => setDuelSetting("dragAttack", v)} />
              <Toggle label="Confirm before ending the turn with an unused Normal Summon" on={s.confirmEnd} set={(v) => setDuelSetting("confirmEnd", v)} />
            </Section>
          )}

          <Section title="Display" id="display">
            <Toggle label="ATK / DEF under monsters" on={s.stats} set={(v) => setDuelSetting("stats", v)} />
            {engine && <Toggle label="Attack outcome preview" on={s.matchup} set={(v) => setDuelSetting("matchup", v)} />}
            <Toggle label="Fade side panels until you point at them" on={s.calmPanels} set={(v) => setDuelSetting("calmPanels", v)} />
          </Section>
        </div>
      )}
    </div>
  );
}

/** A collapsible group; remembers whether it's open in this browser. */
function Section({ title, id, defaultOpen = false, sub = false, children }: { title: string; id: string; defaultOpen?: boolean; sub?: boolean; children: ReactNode }) {
  const key = `ygo.settingsOpen.${id}`;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; } });
  return (
    <details className={`duel-setting-section ${sub ? "is-sub" : ""}`} open={open}
      onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); try { localStorage.setItem(key, o ? "1" : "0"); } catch { /* storage blocked */ } }}>
      <summary>{title}</summary>
      <div className="duel-setting-section-body">{children}</div>
    </details>
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

/** Copies the view settings as JSON (to paste back as new defaults). */
function CopySettings() {
  const s = useDuelSettings();
  const [done, setDone] = useState(false);
  const copy = async () => {
    const text = JSON.stringify(s);
    try { await navigator.clipboard.writeText(text); } catch { prompt("Copy these settings:", text); }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return <button className="duel-setting-reset" onClick={copy} title="Copy all view settings as text">{done ? "Copied ✓" : "Copy settings"}</button>;
}
