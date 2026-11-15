// A room's rules: time control (presets or custom), starting LP, who can find / watch the room.
// Used when creating a room (lobby) and in the room itself, where the host can change them between duels.
import { useEffect, useState } from "react";
import "./RoomRules.css";
import { CHESS_CHOICES, LIMITS, LP_CHOICES, TIMER_CHOICES, cleanSettings, formatTimeControl, formatTimer, type RoomSettings } from "../../../shared/roomSettings.ts";

const DEFAULT_CHESS: [number, number] = [300, 3];
const DEFAULT_TURN = 180;

/** A number field that commits a whole number in [min, max] on blur / Enter (and shows the last good value otherwise). */
function NumField({ value, min, max, onCommit, label, suffix, disabled, width = 64 }: {
  value: number; min: number; max: number; onCommit(v: number): void; label: string; suffix?: string; disabled?: boolean; width?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || draft.trim() === "") { setDraft(String(value)); return; }
    const v = Math.min(max, Math.max(min, n));
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <label className="rr-num">
      <input type="number" inputMode="numeric" min={min} max={max} value={draft} disabled={disabled} aria-label={label} style={{ width }}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

/** Minutes + seconds fields for a duration in seconds. */
function Duration({ sec, min, max, onCommit, label, disabled }: { sec: number; min: number; max: number; onCommit(v: number): void; label: string; disabled?: boolean }) {
  const m = Math.floor(sec / 60), s = sec % 60;
  const set = (nm: number, ns: number) => onCommit(Math.min(max, Math.max(min, nm * 60 + ns)));
  return (
    <span className="rr-duration" role="group" aria-label={label}>
      <NumField value={m} min={0} max={Math.floor(max / 60)} label={`${label}: minutes`} suffix="min" disabled={disabled} onCommit={(v) => set(v, s)} width={58} />
      <NumField value={s} min={0} max={59} label={`${label}: seconds`} suffix="s" disabled={disabled} onCommit={(v) => set(m, v)} width={52} />
    </span>
  );
}

export function RoomRules({ value, onChange, readOnly, access = true }: {
  value: RoomSettings; onChange(next: RoomSettings): void; readOnly?: boolean;
  /** show "who can find it" + spectators */
  access?: boolean;
}) {
  const set = (patch: Partial<RoomSettings>) => onChange(cleanSettings({ ...value, ...patch }));
  const tc = value.timeControl;
  const chessPreset = CHESS_CHOICES.some(([b, i]) => b === value.bankSec && i === value.incrementSec);
  const turnPreset = TIMER_CHOICES.includes(value.turnTimerSec);
  const lpPreset = LP_CHOICES.includes(value.startingLP);
  const dis = readOnly;

  return (
    <div className={`rr ${readOnly ? "is-readonly" : ""}`}>
      <div className="rr-row">
        <span className="rr-label">Time control</span>
        <div className="rr-seg" role="radiogroup" aria-label="Time control">
          {([["off", "No timer"], ["chess", "Chess clock"], ["turn", "Per turn"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={tc === k} className={tc === k ? "is-on" : ""} disabled={dis}
              onClick={() => set(k === "chess" ? { timeControl: "chess", bankSec: value.bankSec || DEFAULT_CHESS[0], incrementSec: value.bankSec ? value.incrementSec : DEFAULT_CHESS[1] }
                : k === "turn" ? { timeControl: "turn", turnTimerSec: value.turnTimerSec || DEFAULT_TURN } : { timeControl: "off" })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tc === "chess" && (
        <>
          <div className="rr-row">
            <span className="rr-label">Presets</span>
            <div className="rr-chips">
              {CHESS_CHOICES.map(([b, i]) => (
                <button key={`${b}+${i}`} type="button" disabled={dis} className={value.bankSec === b && value.incrementSec === i ? "is-on" : ""}
                  onClick={() => set({ bankSec: b, incrementSec: i })} title={`${b / 60} minutes for the duel, +${i}s after every decision`}>
                  {b / 60}+{i}
                </button>
              ))}
              {!chessPreset && <span className="rr-chip-custom is-on">{formatTimeControl(value)} (custom)</span>}
            </div>
          </div>
          <div className="rr-row">
            <span className="rr-label">Custom</span>
            <div className="rr-custom">
              <Duration sec={value.bankSec} min={LIMITS.bankSec.min} max={LIMITS.bankSec.max} label="Time for the duel" disabled={dis} onCommit={(v) => set({ bankSec: v })} />
              <span className="muted">+</span>
              <NumField value={value.incrementSec} min={LIMITS.incrementSec.min} max={LIMITS.incrementSec.max} label="Seconds added per decision" suffix="s per decision" disabled={dis} onCommit={(v) => set({ incrementSec: v })} width={56} />
            </div>
          </div>
          <small className="muted rr-help">Each player has one bank of time for the whole duel; every decision you make adds the increment back. Only the player who has to decide loses time. Running out loses the duel.</small>
        </>
      )}

      {tc === "turn" && (
        <>
          <div className="rr-row">
            <span className="rr-label">Presets</span>
            <div className="rr-chips">
              {TIMER_CHOICES.filter(Boolean).map((t) => (
                <button key={t} type="button" disabled={dis} className={value.turnTimerSec === t ? "is-on" : ""} onClick={() => set({ turnTimerSec: t })}>{formatTimer(t)}</button>
              ))}
              {!turnPreset && <span className="rr-chip-custom is-on">{formatTimer(value.turnTimerSec)} (custom)</span>}
            </div>
          </div>
          <div className="rr-row">
            <span className="rr-label">Custom</span>
            <div className="rr-custom">
              <Duration sec={value.turnTimerSec} min={LIMITS.turnTimerSec.min} max={LIMITS.turnTimerSec.max} label="Time per turn" disabled={dis} onCommit={(v) => set({ turnTimerSec: v })} />
              <span className="muted">per turn</span>
            </div>
          </div>
          <small className="muted rr-help">Each player's clock refills at the start of every turn. Only the player who has to decide loses time.</small>
        </>
      )}

      <div className="rr-row">
        <span className="rr-label">Starting LP</span>
        <div className="rr-chips">
          {LP_CHOICES.map((lp) => (
            <button key={lp} type="button" disabled={dis} className={value.startingLP === lp ? "is-on" : ""} onClick={() => set({ startingLP: lp })}>{lp.toLocaleString()}</button>
          ))}
          <NumField value={value.startingLP} min={LIMITS.startingLP.min} max={LIMITS.startingLP.max} label="Custom starting LP" disabled={dis} onCommit={(v) => set({ startingLP: v })} width={80} suffix={lpPreset ? undefined : "custom"} />
        </div>
      </div>

      {access && (
        <div className="rr-row">
          <span className="rr-label">Room</span>
          <div className="rr-chips">
            <button type="button" disabled={dis} className={value.visibility === "public" ? "is-on" : ""} onClick={() => set({ visibility: value.visibility === "public" ? "unlisted" : "public" })}
              title="Public rooms are listed in the lobby; unlisted rooms are joined with the link.">
              {value.visibility === "public" ? "Listed in the lobby" : "Unlisted (link only)"}
            </button>
            <button type="button" disabled={dis} className={value.spectators ? "is-on" : ""} onClick={() => set({ spectators: !value.spectators })}>
              {value.spectators ? "Spectators allowed" : "No spectators"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
