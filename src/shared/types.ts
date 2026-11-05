// Shared data contracts between the Worker, the React client and the duel engine.
// Changing these affects every phase — coordinate before editing.

export type Category = "Monster" | "Spell" | "Trap" | "Unknown";
export type Section = "main" | "extra" | "side";

/** One card from the catalogue (D1 `cards` row, as returned by the API). */
export interface Card {
  id: number;
  name: string;
  type: string | null;
  kind: string | null;
  category: Category;
  race: string | null;
  attribute: string | null;
  level: number | null;
  atk: number | null;
  defense: number | null;
  linkval: number | null;
  linkmarkers: string[] | null;
  scale: number | null;
  archetype: string | null;
  desc: string | null;
  tcg_date: string | null;
  ocg_date: string | null;
  release_date: string | null;
  konami_id: number | null;
  staple: number | null;
  views: number | null;
  viewsweek: number | null;
  upvotes: number | null;
  downvotes: number | null;
  ban_tcg: string | null;
  ban_ocg: string | null;
  ban_goat: string | null;
}

/** A deck as stored by the app. Card ids are canonical catalogue ids where known,
 *  otherwise the raw id from the .ydk (kept so nothing silently disappears). */
export interface Deck {
  id: string;            // uuid
  name: string;
  main: number[];        // one entry per copy, in .ydk order
  extra: number[];
  side: number[];
  /** .ydk file dates, when imported from a file (YYYY-MM-DD). */
  file_modified?: string | null;
  file_created?: string | null;
  created_at: string;    // ISO timestamp
  updated_at: string;
}

/** User-defined tags: lower-cased card name -> tags (e.g. "handtrap", "tier:S"). */
export type CustomTags = Record<string, string[]>;

export type RelStatus = "generic" | "none" | "thin" | "good" | "unknown";
export type Tier = "S" | "A" | "B" | "C" | "D";

/** A card in the user's library: catalogue data + everything the Python script derived. */
export interface LibraryCard extends Card {
  copies: number;
  decks: string[];                       // deck names
  deck_counts: Record<string, number>;   // deck name -> copies
  deck_dates: Record<string, { modified: string | null; created: string | null }>;
  sections: Section[];
  archetype_count: number;
  related: number;
  rel_arch: number;
  rel_links: Record<number, number>;     // other id -> 2 (names it) | 4 (named by it) | 6
  rel_status: RelStatus;
  tags: string[];
  tier: Tier | null;
  tier_score: number | null;
  tier_src: "estimated" | "yours" | null;
  tier_why: string[];
  tier_conf: "high" | "low" | null;
}

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export type DuelMode = "manual" | "engine";
