// Room settings chosen when a room is created (lobby "Create a room" form).

export interface RoomSettings {
  /** Seconds each player gets per turn; the clock runs only while the duel waits on them. 0 = no timer. */
  turnTimerSec: number;
  startingLP: number;
  /** "unlisted" rooms don't appear in the lobby list; share the link to invite. */
  visibility: "public" | "unlisted";
  spectators: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = { turnTimerSec: 0, startingLP: 8000, visibility: "public", spectators: true };
export const TIMER_CHOICES = [0, 60, 120, 180, 300, 600];
export const LP_CHOICES = [2000, 4000, 8000, 16000];

/** Clamp anything a client sends to the allowed choices. */
export function cleanSettings(raw: unknown): RoomSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof RoomSettings, unknown>>;
  const timer = Number(r.turnTimerSec);
  const lp = Number(r.startingLP);
  return {
    turnTimerSec: TIMER_CHOICES.includes(timer) ? timer : DEFAULT_SETTINGS.turnTimerSec,
    startingLP: LP_CHOICES.includes(lp) ? lp : DEFAULT_SETTINGS.startingLP,
    visibility: r.visibility === "unlisted" ? "unlisted" : "public",
    spectators: r.spectators === false ? false : true,
  };
}

export const formatTimer = (sec: number) => (sec ? (sec % 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec / 60} min`) : "No timer");
