// Demo / autopilot: your side of a rules-enforced duel plays itself (the bot's move picker, in its
// "showcase" style that favours summons, effects and attacks), so you can watch a whole duel and its
// animations. The speed applies to both sides (the bot runs in this browser too, see hostRuntime).
import { useSyncExternalStore } from "react";

export const SPEEDS = { slow: 1600, normal: 900, fast: 400 } as const;
export type Speed = keyof typeof SPEEDS;

const KEY = "ygo.demoSpeed";
const listeners = new Set<() => void>();
let on = false;
let speed: Speed = (() => {
  try { const v = localStorage.getItem(KEY); return v === "slow" || v === "fast" || v === "normal" ? v : "normal"; } catch { return "normal"; }
})();

const emit = () => listeners.forEach((l) => l());
export function setAutopilot(v: boolean) { on = v; emit(); }
export function setSpeed(s: Speed) { speed = s; try { localStorage.setItem(KEY, s); } catch { /* storage blocked */ } emit(); }
export const autopilotOn = () => on;
/** How long a scripted side waits before answering (null = not in a demo: the bot keeps its default). */
export const demoDelay = (): number | null => (on ? SPEEDS[speed] : null);

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useAutopilot() {
  const state = useSyncExternalStore(subscribe, () => `${on}:${speed}`, () => "false:normal");
  const [o, s] = state.split(":");
  return { on: o === "true", speed: s as Speed };
}
