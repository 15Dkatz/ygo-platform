// Card rarities: cosmetic foil finishes picked per card in the deck builder (every copy of a card in a
// deck shares one). Saved with the deck, sent with it to a duel, and shown to both players.
//
// A foil has two independent parts: the name's LETTERING and the PICTURE (the art box). Either pick a
// preset (the named rarities below) or any lettering + picture combination ("custom:gold:holo").

export const RARITIES = ["common", "rare", "super", "ultra", "secret", "starlight", "gold", "platinum", "prismatic", "ghost", "ultimate", "collector"] as const;
export type Preset = (typeof RARITIES)[number];

export const LETTERINGS = ["none", "silver", "gold", "platinum", "copper", "ruby", "emerald", "pastel", "vivid"] as const;
export type Lettering = (typeof LETTERINGS)[number];
export const LETTERING_LABEL: Record<Lettering, string> = {
  none: "Printed (none)", silver: "Silver", gold: "Gold", platinum: "Platinum", copper: "Copper", ruby: "Ruby", emerald: "Emerald",
  pastel: "Pastel rainbow", vivid: "Vivid rainbow",
};

export const PICTURES = [
  "none", "holo", "starlight", "secret", "gold", "platinum", "prism", "ghost", "emboss", "rings",
  // the earlier CSS looks, kept as options
  "classic", "crosshatch", "shimmer", "bubbles", "lattice",
] as const;
export type Picture = (typeof PICTURES)[number];
export const PICTURE_LABEL: Record<Picture, string> = {
  none: "Printed (none)", holo: "Holo (rainbow on the mid-tones)", starlight: "Holo + glitter", secret: "Holo + soft glitter",
  gold: "Gold metal", platinum: "Platinum metal", prism: "Prism colours", ghost: "Ghost (pale silver)", emboss: "Embossed gold relief",
  rings: "Rainbow rings", classic: "Classic diagonal holo", crosshatch: "Crosshatch rainbow", shimmer: "Starlight shimmer",
  bubbles: "Bubbles", lattice: "Gold lattice",
};

/** What each named rarity is made of. */
export const PRESET_PARTS: Record<Preset, { lettering: Lettering; picture: Picture }> = {
  common: { lettering: "none", picture: "none" },
  rare: { lettering: "silver", picture: "none" },
  super: { lettering: "none", picture: "holo" },
  ultra: { lettering: "gold", picture: "holo" },
  secret: { lettering: "pastel", picture: "secret" },
  starlight: { lettering: "vivid", picture: "starlight" },
  gold: { lettering: "gold", picture: "gold" },
  platinum: { lettering: "platinum", picture: "platinum" },
  prismatic: { lettering: "vivid", picture: "prism" },
  ghost: { lettering: "silver", picture: "ghost" },
  ultimate: { lettering: "gold", picture: "emboss" },
  collector: { lettering: "pastel", picture: "rings" },
};

export type Custom = `custom:${Lettering}:${Picture}`;
/** A card's foil: a named rarity or a custom lettering + picture. */
export type Rarity = Preset | Custom;

export const RARITY_LABEL: Record<Preset, string> = {
  common: "Common", rare: "Rare", super: "Super Rare", ultra: "Ultra Rare", secret: "Secret Rare", starlight: "Starlight Rare",
  gold: "Gold Rare", platinum: "Platinum Rare", prismatic: "Prismatic Secret Rare", ghost: "Ghost Rare", ultimate: "Ultimate Rare", collector: "Collector's Rare",
};
export const RARITY_SHORT: Record<Preset, string> = {
  common: "C", rare: "R", super: "SR", ultra: "UR", secret: "ScR", starlight: "StR",
  gold: "GR", platinum: "PlR", prismatic: "PScR", ghost: "GhR", ultimate: "UtR", collector: "CR",
};

export const isPreset = (v: string): v is Preset => (RARITIES as readonly string[]).includes(v);

/** The lettering + picture of any foil value (unknown values: plain). */
export function foilParts(v: string | undefined | null): { lettering: Lettering; picture: Picture } {
  if (!v) return PRESET_PARTS.common;
  if (isPreset(v)) return PRESET_PARTS[v];
  const m = /^custom:([a-z]+):([a-z]+)$/.exec(v);
  if (m && (LETTERINGS as readonly string[]).includes(m[1]) && (PICTURES as readonly string[]).includes(m[2])) return { lettering: m[1] as Lettering, picture: m[2] as Picture };
  return PRESET_PARTS.common;
}

/** The value for a lettering + picture: the matching preset when there is one, else a custom value. */
export function foilOf(lettering: Lettering, picture: Picture): Rarity {
  const preset = RARITIES.find((r) => PRESET_PARTS[r].lettering === lettering && PRESET_PARTS[r].picture === picture);
  return preset ?? `custom:${lettering}:${picture}`;
}

export const rarityLabel = (v: Rarity) => (isPreset(v) ? RARITY_LABEL[v] : `${LETTERING_LABEL[foilParts(v).lettering]} lettering + ${PICTURE_LABEL[foilParts(v).picture]}`);
export const rarityShort = (v: Rarity) => (isPreset(v) ? RARITY_SHORT[v] : "✦");

/** card id (as a string key) -> foil; commons are left out. */
export type RarityMap = Record<string, Rarity>;

export const MAX_RARITY_ENTRIES = 200;

/** Keep only valid foils on plausible card ids (drops commons), at most MAX_RARITY_ENTRIES. */
export function cleanRarities(raw: unknown): RarityMap {
  const out: RarityMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_RARITY_ENTRIES) break;
    if (!/^\d{1,10}$/.test(k) || typeof v !== "string" || v.length > 40) continue;
    const parts = foilParts(v);
    if (parts.lettering === "none" && parts.picture === "none") continue;   // common (or unknown)
    out[k] = foilOf(parts.lettering, parts.picture);
    n++;
  }
  return out;
}

export const rarityOf = (map: RarityMap | undefined | null, code: number): Rarity => (code > 0 && map?.[String(code)]) || "common";
