// Summon and activation effects: a signature per kind of summon (drop + dust for a Normal Summon, a
// summoning circle for a Special Summon, a vortex for Fusion, rings + beam for Synchro, a galaxy for Xyz,
// arrows for Link, a swinging arc for Pendulum...), per kind of activation (spell runes, trap snap,
// monster aura), the line a chain draws between its links, and the card-art splash across the board.
//
// Plain DOM + Web Animations in the animation layer (pointer-events: none), like fx.ts. Every element
// removes itself. Used by the duel's animator and by the /dev/summons lab.
//
// Layout: summonfx/core.ts (kinds, tones, building blocks), summon.ts, activate.ts, splash.ts. This file is
// the public API the animator and the lab use.

export { setFxSpeed, SUMMON_LABEL, ACTIVATE_LABEL, toneOf, summonKindOf, activateKindOf, isBig } from "./summonfx/core.ts";
export type { SummonKind, ActivateKind } from "./summonfx/core.ts";
export { summon } from "./summonfx/summon.ts";
export type { SummonOpts } from "./summonfx/summon.ts";
export { activate, chainLine } from "./summonfx/activate.ts";
export { resetSplashQueue, splash } from "./summonfx/splash.ts";
export type { SplashOpts } from "./summonfx/splash.ts";
export type { SplashStyle } from "../duelSettings.ts";
