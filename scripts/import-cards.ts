/**
 * Import the full YGOPRODeck card catalogue into D1.
 *
 *   npm run cards:import:local     # local dev database (.wrangler/state)
 *   npm run cards:import:remote    # production D1 (needs `wrangler login`)
 *
 * Flags: --cached  reuse data/cardinfo.json instead of downloading again.
 * The API is fetched once (~13k cards); it allows 20 req/s, we make one request.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CARD_COLUMNS, normalizeCard } from "../src/shared/normalize.ts";

const API = "https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes";
const args = new Set(process.argv.slice(2));
const target = args.has("--remote") ? "--remote" : "--local";
const cachePath = "data/cardinfo.json";
const sqlPath = "data/cards.sql";

mkdirSync("data", { recursive: true });

let raw: any[];
if (args.has("--cached") && existsSync(cachePath)) {
  raw = JSON.parse(readFileSync(cachePath, "utf8")).data;
  console.log(`Using cached ${cachePath} (${raw.length} cards)`);
} else {
  console.log("Downloading card catalogue from YGOPRODeck…");
  const res = await fetch(API, { headers: { "User-Agent": "ygo-platform/0.1 (card import)" } });
  if (!res.ok) throw new Error(`YGOPRODeck API answered ${res.status}`);
  const text = await res.text();
  writeFileSync(cachePath, text);
  raw = JSON.parse(text).data;
  console.log(`Downloaded ${raw.length} cards`);
}

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (Array.isArray(v)) return lit(JSON.stringify(v));
  return `'${String(v).replace(/'/g, "''")}'`;
};

const cards = new Map<number, ReturnType<typeof normalizeCard>>();
for (const r of raw) {
  const n = normalizeCard(r);
  cards.set(n.card.id, n);
}

const out: string[] = ["DELETE FROM card_alias;", "DELETE FROM cards;"];
const all = [...cards.values()];
const ROWS = 50; // keep each statement well under D1's 100 KB limit
for (let i = 0; i < all.length; i += ROWS) {
  const rows = all.slice(i, i + ROWS).map(({ card }) => `(${CARD_COLUMNS.map((k) => lit(card[k])).join(",")})`);
  out.push(`INSERT INTO cards (${CARD_COLUMNS.join(",")}) VALUES\n${rows.join(",\n")};`);
}
const aliasPairs = all.flatMap(({ card, aliases }) => aliases.map((a) => [a, card.id] as const));
for (let i = 0; i < aliasPairs.length; i += 500) {
  out.push(`INSERT OR REPLACE INTO card_alias (alias_id, card_id) VALUES ${aliasPairs.slice(i, i + 500).map(([a, c]) => `(${a},${c})`).join(",")};`);
}
out.push(`INSERT OR REPLACE INTO meta (key, value) VALUES ('imported_at', ${lit(new Date().toISOString())}), ('card_count', ${lit(String(all.length))});`);
writeFileSync(sqlPath, out.join("\n") + "\n");
console.log(`Wrote ${sqlPath}: ${all.length} cards, ${aliasPairs.length} alias ids`);

const run = (cmd: string) => {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(`npx wrangler d1 migrations apply DB ${target}`);
run(`npx wrangler d1 execute DB ${target} --file=${sqlPath} --yes`);
console.log("Card import finished.");
