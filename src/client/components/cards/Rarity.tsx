// Foil finishes drawn over a card image. Everything is built from the card's own image (SVG filters):
//  - the name: a crisp mask of just its letters, filled with a moving metal / rainbow gradient, with a
//    dark outline and a specular bevel (a light sweeping across raised letters);
//  - the picture (art box only): per rarity, holo on the art's highlights, glitter, an embossed relief,
//    a ghostly silver, a metal tint...
// The frame, text box and stats are never touched. A mouse glare (rarity.css) follows the pointer.
import { createContext, useContext, useEffect, useId, type CSSProperties, type ReactNode } from "react";
import { foilParts, rarityOf, type Picture, type Rarity, type RarityMap } from "../../../shared/rarity.ts";
import { cardImage } from "../../api.ts";
import "./rarity.css";

/** Spells, Traps and Xyz monsters print their name in light letters on a dark bar. */
export const lightName = (type: string | undefined | null) => !!type && /Spell|Trap|XYZ/i.test(type);

// regions of a standard card image (421 x 614)
const W = 421, H = 614;
const ART = { x: 50, y: 111, w: 321, h: 321 };
const NAME = { x: 30, y: 26, w: 318, h: 47 };

const METAL: Record<string, string[]> = {
  silver: ["#7f8a99", "#e9eef4", "#9aa5b4", "#ffffff", "#8a95a4"],
  gold: ["#a8741b", "#ffe58a", "#c8901c", "#fff6cf", "#b8860b"],
  platinum: ["#7f95b3", "#eef4ff", "#9fb4d1", "#ffffff", "#8aa0bf"],
  pastel: ["#ff9ab4", "#ffe08a", "#9df5c0", "#9adcff", "#d3a6ff"],
  copper: ["#8a4a24", "#f2b48a", "#b06a3c", "#ffd9bf", "#9c5a30"],
  ruby: ["#8e0f2e", "#ff6b8b", "#b8183f", "#ffc2d0", "#a3123a"],
  emerald: ["#0c6b45", "#6ff2b4", "#13915c", "#c6ffe6", "#0f7c4f"],
  vivid: ["#ff2e63", "#ffb300", "#20d47a", "#1fa8ff", "#9b40ff"],
};
const RAINBOW = ["#ff2e63", "#ff9f1c", "#ffe14d", "#2ee59d", "#1fb6ff", "#8f5bff", "#ff2e63"];

/** The SVG layers each picture style is made of (the earlier CSS looks are drawn by rarity.css). */
const PICTURE_LAYERS: Record<Picture, string[]> = {
  none: [], holo: ["holo"], starlight: ["holo", "glitter"], secret: ["holo", "glitterSoft"],
  gold: ["tint:gold", "sheen:gold"], platinum: ["tint:platinum", "sheen:platinum"], prism: ["prism", "holo"],
  ghost: ["ghost", "sheen:silver"], emboss: ["emboss", "tint:gold"], rings: ["rings", "holo"],
  classic: [], crosshatch: [], shimmer: [], bubbles: [], lattice: [],
};
const LEGACY = new Set<Picture>(["classic", "crosshatch", "shimmer", "bubbles", "lattice"]);

function styleOf(v: Rarity): { name?: keyof typeof METAL; art: string[]; picture: Picture } {
  const { lettering, picture } = foilParts(v);
  return { name: lettering === "none" ? undefined : lettering, art: PICTURE_LAYERS[picture], picture };
}

const Stops = ({ colors }: { colors: string[] }) => <>{[...colors, colors[0]].map((c, i, a) => <stop key={i} offset={i / (a.length - 1)} stopColor={c} />)}</>;

/** One SVG layer over the card image, blended with it (each blend mode needs its own <svg>). */
function Layer({ blend, opacity, children }: { blend?: CSSProperties["mixBlendMode"]; opacity?: number; children: ReactNode }) {
  return <svg className="rf-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ mixBlendMode: blend, opacity }} aria-hidden="true">{children}</svg>;
}

function FoilLayers({ code, rarity, light }: { code: number; rarity: Rarity; light: boolean }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const st = styleOf(rarity);
  if ((!st.name && !st.art.length) || code <= 0) return null;
  const href = cardImage(code, "full");
  const id = (s: string) => `${s}${u}`;
  const url = (s: string) => `url(#${id(s)})`;
  // luminance -> alpha, then a steep ramp: crisp letter edges (dark letters, or light ones on dark bars)
  const toAlpha = light ? "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2126 0.7152 0.0722 0 0" : "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1";
  const ramp = light ? { slope: 9, intercept: -6.3 } : { slope: 9, intercept: -5.6 };
  const art = st.art;
  const has = (k: string) => art.some((a) => a === k || a.startsWith(`${k}:`));
  const param = (k: string) => art.find((a) => a.startsWith(`${k}:`))?.split(":")[1] ?? "gold";
  const artRect = (fill: string, extra?: Record<string, string>) => <rect x={ART.x} y={ART.y} width={ART.w} height={ART.h} fill={fill} {...extra} />;

  return (
    <>
      {/* shared definitions (ids are page-wide, so the other layers can use them) */}
      <svg className="rf-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ width: 0, height: 0 }}>
        <defs>
          <clipPath id={id("art")}><rect x={ART.x} y={ART.y} width={ART.w} height={ART.h} /></clipPath>
          {/* the letters of the name */}
          <filter id={id("fl")} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={toAlpha} />
            <feComponentTransfer><feFuncA type="linear" slope={ramp.slope} intercept={ramp.intercept} /></feComponentTransfer>
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
          </filter>
          <mask id={id("ml")} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <image href={href} width={W} height={H} preserveAspectRatio="none" filter={url("fl")} />
          </mask>
          {/* raised metal letters: outline + specular light sweeping across */}
          <filter id={id("bevel")} x="-2%" y="-10%" width="104%" height="120%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="grow" />
            <feFlood floodColor="#000" floodOpacity=".55" />
            <feComposite in2="grow" operator="in" result="outline" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="bump" />
            <feSpecularLighting in="bump" surfaceScale="3.2" specularConstant="1.25" specularExponent="18" lightingColor="#fff" result="spec">
              <fePointLight x="0" y="-30" z="70"><animate attributeName="x" values="-40;460;-40" dur="3.6s" repeatCount="indefinite" /></fePointLight>
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine" />
            <feMerge><feMergeNode in="outline" /><feMergeNode in="SourceGraphic" /><feMergeNode in="shine" /></feMerge>
          </filter>
          {/* the art's highlights (bright areas), for holo */}
          <filter id={id("fh")} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.2126 0.7152 0.0722 0 0" />
            <feComponentTransfer><feFuncA type="table" tableValues="0 .15 .55 .9 1 1 .95 .7 .35 .1" /></feComponentTransfer>
          </filter>
          <mask id={id("mh")} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <image href={href} width={W} height={H} preserveAspectRatio="none" filter={url("fh")} clipPath={url("art")} />
          </mask>
          {/* glitter specks */}
          {[1, 2].map((n) => (
            <filter key={n} id={id(`fg${n}`)} x="0" y="0" width="1" height="1">
              <feTurbulence type="fractalNoise" baseFrequency={n === 1 ? ".55" : ".75"} numOctaves="1" seed={n * 7} />
              <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 14 -9.4" />
            </filter>
          ))}
          {[1, 2].map((n) => (
            <mask key={n} id={id(`mg${n}`)} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <rect x={ART.x} y={ART.y} width={ART.w} height={ART.h} filter={url(`fg${n}`)} />
            </mask>
          ))}
          {/* embossed relief of the art */}
          <filter id={id("emb")} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2126 0.7152 0.0722 0 0" result="h" />
            <feDiffuseLighting in="h" surfaceScale="5" diffuseConstant="1.15" lightingColor="#ffeab0"><feDistantLight azimuth="235" elevation="38" /></feDiffuseLighting>
          </filter>
          {/* ghost: the art pale and silvery */}
          <filter id={id("gh")} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0.05" />
            <feComponentTransfer>
              <feFuncR type="linear" slope=".62" intercept=".42" /><feFuncG type="linear" slope=".62" intercept=".44" /><feFuncB type="linear" slope=".62" intercept=".5" />
            </feComponentTransfer>
          </filter>
          {/* gradients */}
          <linearGradient id={id("gn")} x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
            <Stops colors={METAL[st.name ?? "silver"]} />
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to={`${W} 0`} dur="4s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id={id("rb")} x1="0" y1="0" x2="220" y2="220" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
            {RAINBOW.map((c, i) => <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="220 220" dur="5s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id={id("mt")} x1="0" y1="0" x2={W} y2={H} gradientUnits="userSpaceOnUse" spreadMethod="repeat">
            <Stops colors={METAL[param("tint") === "platinum" ? "platinum" : param("sheen") === "silver" ? "silver" : "gold"]} />
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to={`${W} ${H}`} dur="6s" repeatCount="indefinite" />
          </linearGradient>
          <radialGradient id={id("rg")} cx="50%" cy="50%" r="18%" spreadMethod="repeat">
            {RAINBOW.map((c, i) => <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
          </radialGradient>
        </defs>
      </svg>

      {/* ---- the picture ---- */}
      {has("ghost") && <Layer opacity={0.78}><image href={href} width={W} height={H} preserveAspectRatio="none" filter={url("gh")} clipPath={url("art")} /></Layer>}
      {has("emboss") && <Layer blend="overlay" opacity={0.65}><image href={href} width={W} height={H} preserveAspectRatio="none" filter={url("emb")} clipPath={url("art")} /></Layer>}
      {has("tint") && <Layer blend="color" opacity={param("tint") === "platinum" ? 0.4 : 0.32}>{artRect(url("mt"))}</Layer>}
      {has("prism") && <Layer blend="color-dodge" opacity={0.16}>{artRect(url("rb"))}</Layer>}
      {has("rings") && (
        <Layer blend="color-dodge" opacity={0.55}>
          {artRect(url("rg"), { mask: url("mh") })}
        </Layer>
      )}
      {/* holo: a moving rainbow over the art's mid-tones (colour + a little contrast for vibrance) */}
      {has("holo") && <Layer blend="color" opacity={st.picture === "starlight" || st.picture === "prism" ? 0.4 : 0.32}>{artRect(url("rb"), { mask: url("mh") })}</Layer>}
      {has("holo") && <Layer blend="overlay" opacity={0.22}>{artRect(url("rb"), { mask: url("mh") })}</Layer>}
      {has("sheen") && <Layer blend="screen" opacity={0.55}>{artRect(url("mt"), { mask: url("mh") })}</Layer>}
      {(has("glitter") || has("glitterSoft")) && (
        // rainbow sparkles painted over the art, two sets twinkling in turn
        <Layer opacity={has("glitter") ? 0.9 : 0.55}>
          <rect x={ART.x} y={ART.y} width={ART.w} height={ART.h} fill={url("rb")} mask={url("mg1")}>
            <animate attributeName="opacity" values="1;.15;1" dur="1.4s" repeatCount="indefinite" />
          </rect>
          <rect x={ART.x} y={ART.y} width={ART.w} height={ART.h} fill="#fff" mask={url("mg2")}>
            <animate attributeName="opacity" values=".15;1;.15" dur="1.4s" repeatCount="indefinite" />
          </rect>
        </Layer>
      )}

      {/* ---- the name's letters ---- */}
      {st.name && (
        <Layer>
          <g filter={url("bevel")}>
            <rect x={NAME.x} y={NAME.y} width={NAME.w} height={NAME.h} fill={url("gn")} mask={url("ml")} />
          </g>
        </Layer>
      )}
    </>
  );
}

/** The foil for one card. Put it inside a positioned box that clips (the card face).
 *  `code` and `type` let it build the name and picture effects from the card image. */
export function RarityFoil({ rarity, type, code = 0 }: { rarity: Rarity; type?: string | null; code?: number }) {
  const { lettering, picture } = foilParts(rarity);
  if (lettering === "none" && picture === "none") return null;
  return (
    <span className={`rfoil pic-${picture} let-${lettering}`} aria-hidden="true">
      {/* the earlier CSS picture looks (classic holo, crosshatch, shimmer, bubbles, lattice) */}
      {LEGACY.has(picture) && <i className={`rf-legacy lg-${picture}`} />}
      <FoilLayers code={code} rarity={rarity} light={lightName(type)} />
      {picture !== "none" && <i className="rf-glare" />}
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
