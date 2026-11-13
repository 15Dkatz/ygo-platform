// Card rarities: cosmetic foil finishes picked per card in the deck builder (every copy of a card in a
// deck shares one rarity). Saved with the deck, sent with it to a duel, and shown to both players.

// The last six only touch the name and the art (never the text box).
export const RARITIES = ["common", "rare", "super", "ultra", "secret", "starlight", "gold", "platinum", "prismatic", "ghost", "ultimate", "collector"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common", rare: "Rare", super: "Super Rare", ultra: "Ultra Rare", secret: "Secret Rare", starlight: "Starlight Rare",
  gold: "Gold Rare", platinum: "Platinum Rare", prismatic: "Prismatic Secret Rare", ghost: "Ghost Rare", ultimate: "Ultimate Rare", collector: "Collector's Rare",
};
export const RARITY_SHORT: Record<Rarity, string> = {
  common: "C", rare: "R", super: "SR", ultra: "UR", secret: "ScR", starlight: "StR",
  gold: "GR", platinum: "PlR", prismatic: "PScR", ghost: "GhR", ultimate: "UtR", collector: "CR",
};

/** card id (as a string key) -> rarity; commons are left out. */
export type RarityMap = Record<string, Rarity>;

export const MAX_RARITY_ENTRIES = 200;

/** Keep only known rarities on plausible card ids (drops commons), at most MAX_RARITY_ENTRIES. */
export function cleanRarities(raw: unknown): RarityMap {
  const out: RarityMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_RARITY_ENTRIES) break;
    if (!/^\d{1,10}$/.test(k) || typeof v !== "string" || v === "common" || !(RARITIES as readonly string[]).includes(v)) continue;
    out[k] = v as Rarity;
    n++;
  }
  return out;
}

export const rarityOf = (map: RarityMap | undefined | null, code: number): Rarity => (code > 0 && map?.[String(code)]) || "common";
