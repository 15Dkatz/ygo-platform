// Foil finishes drawn over a card image (see rarity.css). The shine follows the mouse: one global
// pointer listener sets --mx / --my on the hovered card.
import { createContext, useContext, useEffect, useId } from "react";
import { rarityOf, type Rarity, type RarityMap } from "../../../shared/rarity.ts";
import { cardImage } from "../../api.ts";
import "./rarity.css";

/** Spells, Traps and Xyz monsters print their name in light letters on a dark bar. */
export const lightName = (type: string | undefined | null) => !!type && /Spell|Trap|XYZ/i.test(type);

/** The foil colours of each rarity's name lettering (none = the name is left alone). */
const LETTERS: Partial<Record<Rarity, string[]>> = {
  rare: ["#aeb7c4", "#ffffff", "#8e99a8", "#f2f5f9"],
  ultra: ["#c8901c", "#ffe58a", "#a8741b", "#fff3c0"],
  secret: ["#ff9ab4", "#ffe08a", "#9df5c0", "#9adcff", "#d3a6ff"],
  starlight: ["#ff3d6e", "#ffb02e", "#3ddc84", "#2eb6ff", "#a24dff"],
  gold: ["#d4a017", "#fff1a0", "#b8860b", "#ffe066"],
  platinum: ["#9fb4d1", "#f4f8ff", "#8aa0bf", "#dbe6f5"],
  prismatic: ["#ff3d6e", "#ffb02e", "#3ddc84", "#2eb6ff", "#a24dff"],
  ghost: ["#d7dde6", "#ffffff", "#b9c2cf", "#ffffff"],
  ultimate: ["#c99a2e", "#ffe9a0", "#9a6b12", "#f5d277"],
  collector: ["#ff9ab4", "#ffe08a", "#9df5c0", "#9adcff", "#d3a6ff"],
};

/** The name's letters in foil: the card image is thresholded into a mask of just the letters (dark
 *  letters, or light ones on Spells / Traps / Xyz), and a moving foil gradient shows through it. */
function NameLetters({ code, rarity, light }: { code: number; rarity: Rarity; light: boolean }) {
  const id = useId().replace(/:/g, "");
  const colors = LETTERS[rarity];
  if (!colors || code <= 0) return null;
  // alpha = 1 where the pixel is letter-dark (or letter-light), 0 elsewhere
  const lum = "0.2126 0.7152 0.0722 0 0";
  const toAlpha = light ? `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${lum}` : `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1`;
  const stops = [...colors, colors[0]];
  return (
    <svg className="rf-letters" viewBox="0 0 421 614" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={`f${id}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1`} />
          <feColorMatrix type="matrix" values={toAlpha} />
          <feComponentTransfer><feFuncA type="discrete" tableValues={light ? "0 0 0 0 0 0 0 1 1 1" : "0 0 0 0 0 0 0 1 1 1"} /></feComponentTransfer>
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="421" height="614">
          <image href={cardImage(code, "full")} x="0" y="0" width="421" height="614" preserveAspectRatio="none" filter={`url(#f${id})`} />
        </mask>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="421" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
          {stops.map((c, i) => <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
          <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="421 0" dur="3.2s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      {/* the name only: left of the attribute icon */}
      <rect x="30" y="27" width="318" height="45" fill={`url(#g${id})`} mask={`url(#m${id})`} />
    </svg>
  );
}

/** The foil layers for one card. Put it inside a positioned box that clips (the card face).
 *  `code` and `type` let it paint the name's letters. */
export function RarityFoil({ rarity, type, code = 0 }: { rarity: Rarity; type?: string | null; code?: number }) {
  if (rarity === "common") return null;
  return (
    <span className={`rfoil r-${rarity}`} aria-hidden="true">
      <i className="rf-art" /><i className="rf-glare" />
      <NameLetters code={code} rarity={rarity} light={lightName(type)} />
    </span>
  );
}

/** Rarity lookup for duel boards: each player's deck map (seat 0, seat 1). */
export const RarityContext = createContext<(code: number, owner: 0 | 1 | undefined) => Rarity>(() => "common");
export const useRarity = () => useContext(RarityContext);
export const rarityLookup = (maps: [RarityMap | undefined, RarityMap | undefined]) =>
  (code: number, owner: 0 | 1 | undefined): Rarity => rarityOf(owner === undefined ? (maps[0]?.[code] ? maps[0] : maps[1]) : maps[owner], code);

let installed = false;
/** Once per page: the foil's glare follows the pointer over any card with a foil. */
export function useFoilPointer() {
  useEffect(() => {
    if (installed) return;
    installed = true;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const host = (e.target as HTMLElement)?.closest?.<HTMLElement>("[data-foil]") ?? null;
      if (last && last !== host) { last.style.removeProperty("--mx"); last.style.removeProperty("--my"); }
      last = host;
      if (!host) return;
      const r = host.getBoundingClientRect();
      host.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      host.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    addEventListener("pointermove", onMove, { passive: true });
  }, []);
}
