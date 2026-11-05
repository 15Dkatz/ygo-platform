// Node-only helpers shared by scripts/import-engine-data.ts and the engine tests:
// read BabelCDB `cards.cdb` rows and index the CardScripts checkout by script name.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineCardRow, EngineDataSource } from "../../src/worker/duel/engine/data.ts";

const TYPE_LINK = 0x4000000;

/** Folders of a ProjectIgnis/CardScripts checkout that hold scripts we serve (flattened by name). */
const SCRIPT_DIRS = ["", "official", "pre-release"];
const EXTRA_FILES = ["unofficial/proc_unofficial.lua"];

/** name ("c123.lua", "utility.lua") -> absolute path. Earlier folders win. */
export function indexScripts(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of SCRIPT_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) if (f.endsWith(".lua") && !out.has(f)) out.set(f, join(abs, f));
  }
  for (const f of EXTRA_FILES) {
    const abs = join(root, f);
    const name = f.slice(f.lastIndexOf("/") + 1);
    if (existsSync(abs) && !out.has(name)) out.set(name, abs);
  }
  return out;
}

/** Read every card from a BabelCDB-format `cards.cdb` (needs Node's built-in sqlite). */
export async function readCdb(path: string, scripts: Map<string, string>): Promise<(EngineCardRow & { ot: number })[]> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path, { readOnly: true });
  const stmt = db.prepare(
    `SELECT d.id, d.ot, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute,
            t.name, t.str1, t.str2, t.str3, t.str4, t.str5, t.str6, t.str7, t.str8,
            t.str9, t.str10, t.str11, t.str12, t.str13, t.str14, t.str15, t.str16
       FROM datas d LEFT JOIN texts t ON t.id = d.id`,
  );
  stmt.setReadBigInts(true);
  const rows = stmt.all() as Record<string, bigint | string | null>[];
  db.close();
  return rows.map((r) => {
    const num = (k: string) => Number(r[k] ?? 0);
    const setcode = BigInt(r.setcode ?? 0) & 0xffffffffffffffffn;
    const setcodes: number[] = [];
    for (let i = 0n; i < 4n; i++) {
      const s = Number((setcode >> (i * 16n)) & 0xffffn);
      if (s) setcodes.push(s);
    }
    const type = num("type"), lv = num("level");
    const isLink = (type & TYPE_LINK) !== 0;
    const strings: string[] = [];
    for (let i = 1; i <= 16; i++) strings.push(String(r[`str${i}`] ?? ""));
    while (strings.length && !strings[strings.length - 1]) strings.pop();
    const id = num("id");
    return {
      id, ot: num("ot"), alias: num("alias"), setcodes, type,
      level: lv & 0xff, lscale: (lv >>> 24) & 0xff, rscale: (lv >>> 16) & 0xff,
      attribute: num("attribute"), race: num("race"),
      atk: num("atk"), def: isLink ? 0 : num("def"), link_marker: isLink ? num("def") : 0,
      name: String(r.name ?? ""), strings, has_script: scripts.has(`c${id}.lua`),
    };
  });
}

/** An EngineDataSource backed by local files (tests, offline tools). */
export function fileSource(cards: Map<number, EngineCardRow>, scripts: Map<string, string>): EngineDataSource & { scriptReads: number } {
  const src = {
    scriptReads: 0,
    async cards(codes: number[]) {
      const out = new Map<number, EngineCardRow>();
      for (const c of codes) { const row = cards.get(c); if (row) out.set(c, row); }
      return out;
    },
    async scripts(names: string[]) {
      const out = new Map<string, string | null>();
      for (const n of names) {
        src.scriptReads++;
        const p = scripts.get(n);
        out.set(n, p ? readFileSync(p, "utf8") : null);
      }
      return out;
    },
  };
  return src;
}
