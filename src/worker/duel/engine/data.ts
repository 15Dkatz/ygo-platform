// Card rows + Lua scripts for the engine. The sync core cannot wait for I/O, so the duel
// asks `EngineData` synchronously; anything not yet in memory is recorded as missing,
// fetched afterwards, and the duel is rebuilt by replay (see EngineDuel).

import type { OcgCardData } from "ocgcore-wasm";

/** One `engine_cards` row (BabelCDB `datas` + `texts`, unpacked). */
export interface EngineCardRow {
  id: number;
  alias: number;
  setcodes: number[];     // 16-bit archetype codes
  type: number;
  level: number;          // level / rank / link rating
  attribute: number;
  race: number;
  atk: number;
  def: number;            // for Link monsters: 0 (markers are in link_marker)
  lscale: number;
  rscale: number;
  link_marker: number;
  name: string;
  strings: string[];      // str1..str16 (effect descriptions used in prompts)
  has_script: boolean;
}

/** Where engine data comes from (D1 + R2 in the Worker, JSON + disk in tests). */
export interface EngineDataSource {
  cards(codes: number[]): Promise<Map<number, EngineCardRow>>;
  /** Missing scripts map to null. Names are what the core asks for: "c123.lua", "utility.lua". */
  scripts(names: string[]): Promise<Map<string, string | null>>;
}

/** Scripts every duel loads (constant.lua / utility.lua pull in the rest via Duel.LoadScript). */
export const BASE_SCRIPTS = [
  "constant.lua", "utility.lua",
  "card_counter_constants.lua", "archetype_setcode_constants.lua",
  "debug_utility.lua", "chain.lua", "cards_specific_functions.lua", "deprecated_functions.lua",
  "proc_fusion.lua", "proc_fusion_spell.lua", "proc_ritual.lua", "proc_synchro.lua", "proc_union.lua",
  "proc_xyz.lua", "proc_pendulum.lua", "proc_link.lua", "proc_equip.lua", "proc_persistent.lua",
  "proc_workaround.lua", "proc_normal.lua", "proc_skill.lua", "proc_rush.lua", "proc_maximum.lua",
  "proc_gemini.lua", "proc_spirit.lua", "proc_unofficial.lua",
];

// Isolate-wide caches: every room in this isolate shares them (scripts are immutable per deploy).
const cardCache = new Map<number, EngineCardRow | null>();
const scriptCache = new Map<string, string | null>();

/** EDOPro: alias codes closer than this to the card code are alternate artworks. */
export const ARTWORK_OFFSET = 20;

export class EngineData {
  private missingCards = new Set<number>();
  private missingScripts = new Set<string>();
  private source: EngineDataSource;
  constructor(source: EngineDataSource) { this.source = source; }

  // ---- sync side, called from inside the core ----
  card(code: number): OcgCardData | null {
    const row = cardCache.get(code);
    if (row === undefined) { this.missingCards.add(code); return null; }
    if (!row) return null;
    return {
      code: row.id, alias: row.alias, setcodes: row.setcodes, type: row.type, level: row.level,
      attribute: row.attribute, race: BigInt(row.race), attack: row.atk, defense: row.def,
      lscale: row.lscale, rscale: row.rscale, link_marker: row.link_marker,
    };
  }
  row(code: number): EngineCardRow | null { return cardCache.get(code) ?? null; }
  /** Alternate artworks share the original's rules and script: like EDOPro, an alias within
   *  ARTWORK_OFFSET of the code means "same card, other art". Needs the row loaded. */
  canonical(code: number): number {
    const alias = cardCache.get(code)?.alias ?? 0;
    return alias && Math.abs(alias - code) < ARTWORK_OFFSET ? alias : code;
  }
  script(name: string): string | null {
    const key = normalizeScriptName(name);
    const body = scriptCache.get(key);
    if (body === undefined) {
      // A card's script only exists if engine_cards says so; don't fetch (and retry) for nothing.
      const code = cardScriptCode(key);
      if (code !== null && cardCache.get(code)?.has_script === false) return null;
      this.missingScripts.add(key);
      return null;
    }
    return body;
  }
  hasMissing(): boolean { return this.missingCards.size > 0 || this.missingScripts.size > 0; }

  // ---- async side ----
  /** Fetch everything recorded as missing. Returns true if anything new became available. */
  async fetchMissing(): Promise<boolean> {
    const cards = [...this.missingCards], scripts = [...this.missingScripts];
    this.missingCards.clear(); this.missingScripts.clear();
    await this.ensureCards(cards);
    // card scripts for the cards we just learned about
    await this.ensureScripts([...scripts, ...cards.flatMap((c) => cardCache.get(c)?.has_script ? [`c${c}.lua`] : [])]);
    return cards.some((c) => cardCache.get(c)) || scripts.some((s) => scriptCache.get(s) != null);
  }

  async ensureCards(codes: number[]): Promise<void> {
    const need = [...new Set(codes)].filter((c) => c > 0 && !cardCache.has(c));
    if (!need.length) return;
    const got = await this.source.cards(need);
    for (const c of need) cardCache.set(c, got.get(c) ?? null);
  }
  async ensureScripts(names: string[]): Promise<void> {
    const need = [...new Set(names.map(normalizeScriptName))].filter((n) => !scriptCache.has(n));
    if (!need.length) return;
    const got = await this.source.scripts(need);
    for (const n of need) scriptCache.set(n, got.get(n) ?? null);
  }

  /** Load cards + scripts for the given decks, plus cards their scripts mention (tokens etc.). */
  async preload(deckCodes: number[]): Promise<void> {
    await Promise.all([this.ensureCards(deckCodes), this.ensureScripts(BASE_SCRIPTS)]);
    // alternate artworks play as their original card
    const codes = [...new Set(deckCodes.map((c) => this.canonical(c)))];
    await this.ensureCards(codes);
    await this.ensureScripts(codes.filter((c) => cardCache.get(c)?.has_script).map((c) => `c${c}.lua`));
    // One hop of "listed" codes: 5-9 digit numbers in the deck's scripts that are real cards.
    const mentioned = new Set<number>();
    for (const c of codes) {
      const body = scriptCache.get(`c${c}.lua`);
      if (!body) continue;
      for (const m of body.matchAll(/\b(\d{5,9})\b/g)) mentioned.add(Number(m[1]));
      // token makers usually create `id+1`, `id+2`, ... (Scapegoat makes id+1..id+4)
      const plus = [...body.matchAll(/\bid\s*\+\s*(\d)\b/g)].map((m) => Number(m[1]));
      if (plus.length || /\bid\s*\+\s*i\b/.test(body)) for (let k = 1; k <= Math.max(4, ...plus); k++) mentioned.add(c + k);
    }
    await this.ensureCards([...mentioned]);
    await this.ensureScripts([...mentioned].filter((c) => cardCache.get(c)?.has_script).map((c) => `c${c}.lua`));
  }
}

export function normalizeScriptName(name: string): string {
  // the core may ask for "./script/c123.lua" style paths; we store flat names
  const i = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return i >= 0 ? name.slice(i + 1) : name;
}
function cardScriptCode(name: string): number | null {
  const m = /^c(\d+)\.lua$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** For tests: forget the isolate caches. */
export function clearEngineCaches(): void { cardCache.clear(); scriptCache.clear(); }

// ---------------------------------------------------------------------------------------
// Worker source: D1 `engine_cards` + R2 `SCRIPTS` bucket (key "scripts/<name>").

interface EngineCardDbRow {
  id: number; alias: number; setcodes: string; type: number; level: number; attribute: number;
  race: number; atk: number; def: number; lscale: number; rscale: number; link_marker: number;
  name: string; strings: string; has_script: number;
}

export function d1r2Source(db: D1Database, bucket: R2Bucket): EngineDataSource {
  return {
    async cards(codes) {
      const out = new Map<number, EngineCardRow>();
      for (let i = 0; i < codes.length; i += 90) {   // D1 binds at most ~90 params per statement
        const chunk = codes.slice(i, i + 90);
        const { results } = await db
          .prepare(`SELECT * FROM engine_cards WHERE id IN (${chunk.map(() => "?").join(",")})`)
          .bind(...chunk).all<EngineCardDbRow>();
        for (const r of results) out.set(r.id, dbRowToCard(r));
      }
      return out;
    },
    async scripts(names) {
      const out = new Map<string, string | null>();
      await Promise.all(names.map(async (n) => {
        const obj = await bucket.get(`scripts/${n}`);
        out.set(n, obj ? await obj.text() : null);
      }));
      return out;
    },
  };
}

export function dbRowToCard(r: EngineCardDbRow): EngineCardRow {
  return {
    id: r.id, alias: r.alias, setcodes: JSON.parse(r.setcodes || "[]"), type: r.type, level: r.level,
    attribute: r.attribute, race: r.race, atk: r.atk, def: r.def, lscale: r.lscale, rscale: r.rscale,
    link_marker: r.link_marker, name: r.name, strings: JSON.parse(r.strings || "[]"), has_script: !!r.has_script,
  };
}
