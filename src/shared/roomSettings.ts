// Room settings chosen when a room is created (lobby "Create a room" form).

/** How time is kept. The clock only runs for the player the duel is waiting on (who has a decision to make).
 *  "turn": each player gets `turnTimerSec` again at every new turn.
 *  "chess": one bank of `bankSec` for the whole duel, plus `incrementSec` back after every decision you make. */
export type TimeControl = "off" | "turn" | "chess";

export interface RoomSettings {
  timeControl: TimeControl;
  /** "turn" mode: seconds per player per turn. */
  turnTimerSec: number;
  /** "chess" mode: the starting bank and the seconds added after each decision. */
  bankSec: number;
  incrementSec: number;
  startingLP: number;
  /** "unlisted" rooms don't appear in the lobby list; share the link to invite. */
  visibility: "public" | "unlisted";
  spectators: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = { timeControl: "turn", turnTimerSec: 300, bankSec: 0, incrementSec: 0, startingLP: 8000, visibility: "public", spectators: true };
export const TIMER_CHOICES = [0, 60, 120, 180, 300, 600];
/** Chess-style presets: [bank seconds, seconds added per decision]. */
export const CHESS_CHOICES: [number, number][] = [[180, 2], [300, 3], [600, 5], [900, 10], [1800, 15]];
export const LP_CHOICES = [2000, 4000, 8000, 16000];

/** Custom times and LP: whole numbers in these ranges (seconds / LP). */
export const LIMITS = {
  turnTimerSec: { min: 10, max: 3600 },
  bankSec: { min: 30, max: 7200 },
  incrementSec: { min: 0, max: 120 },
  startingLP: { min: 100, max: 99999 },
} as const;
const inRange = (v: unknown, k: keyof typeof LIMITS): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= LIMITS[k].min && n <= LIMITS[k].max ? n : null;
};

/** Clamp anything a client sends to the allowed ranges (the presets, or any custom time / LP in LIMITS). */
export function cleanSettings(raw: unknown): RoomSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof RoomSettings, unknown>>;
  const turnSec = inRange(r.turnTimerSec, "turnTimerSec");
  const bank = inRange(r.bankSec, "bankSec"), inc = inRange(r.incrementSec, "incrementSec");
  // rooms from before time controls: a turn timer means "turn" mode
  const tc: TimeControl = r.timeControl === "chess" && bank !== null && inc !== null ? "chess" : (r.timeControl === "turn" || r.timeControl === undefined) && turnSec ? "turn" : "off";
  return {
    timeControl: tc,
    turnTimerSec: tc === "turn" ? turnSec! : 0,
    bankSec: tc === "chess" ? bank! : 0,
    incrementSec: tc === "chess" ? inc! : 0,
    startingLP: inRange(r.startingLP, "startingLP") ?? DEFAULT_SETTINGS.startingLP,
    visibility: r.visibility === "unlisted" ? "unlisted" : "public",
    spectators: r.spectators === false ? false : true,
  };
}

/** 90 -> "1:30", 300 -> "5", 45 -> "0:45" (minutes, with seconds when there are any). */
const mmss = (sec: number) => (sec % 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec / 60}`);
export const formatTimer = (sec: number) => (sec ? (sec % 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec / 60} min`) : "No timer");

/** "5 min per turn", "10+5", "No timer". */
export function formatTimeControl(s: Pick<RoomSettings, "timeControl" | "turnTimerSec" | "bankSec" | "incrementSec">): string {
  if (s.timeControl === "chess") return `${mmss(s.bankSec)}+${s.incrementSec}`;
  if (s.timeControl === "turn" && s.turnTimerSec) return `${formatTimer(s.turnTimerSec)} per turn`;
  return "No timer";
}
/** One <select> value per time control ("off", "turn:120", "chess:300+3"). */
export const timeControlValue = (s: RoomSettings) => s.timeControl === "chess" ? `chess:${s.bankSec}+${s.incrementSec}` : s.timeControl === "turn" ? `turn:${s.turnTimerSec}` : "off";
export function parseTimeControl(v: string): Pick<RoomSettings, "timeControl" | "turnTimerSec" | "bankSec" | "incrementSec"> {
  const m = /^chess:(\d+)\+(\d+)$/.exec(v);
  if (m) return { timeControl: "chess", turnTimerSec: 0, bankSec: Number(m[1]), incrementSec: Number(m[2]) };
  const t = /^turn:(\d+)$/.exec(v);
  if (t && Number(t[1])) return { timeControl: "turn", turnTimerSec: Number(t[1]), bankSec: 0, incrementSec: 0 };
  return { timeControl: "off", turnTimerSec: 0, bankSec: 0, incrementSec: 0 };
}
