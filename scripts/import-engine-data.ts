/**
 * Imports rules-engine data (phase 4):
 *   - ProjectIgnis BabelCDB `cards.cdb`  -> D1 table `engine_cards` (migration 0004)
 *   - ProjectIgnis CardScripts (*.lua)  -> R2 bucket `ygo-platform-scripts` (binding SCRIPTS), key "scripts/<name>"
 *
 * Get the sources first (both AGPL-3.0, see LICENSES/NOTICE.md), into the gitignored data/ folder:
 *   curl -L -o data/vendor/babelcdb/cards.cdb https://github.com/ProjectIgnis/BabelCDB/raw/master/cards.cdb
 *   curl -L -o data/vendor/cardscripts/CardScripts.zip https://github.com/ProjectIgnis/CardScripts/archive/refs/heads/master.zip
 *   (unzip it so data/vendor/cardscripts/CardScripts-master/utility.lua exists)
 *
 * Then (Node 22 needs --experimental-sqlite; Node 23+ doesn't):
 *   node --experimental-sqlite --experimental-strip-types scripts/import-engine-data.ts --local
 *   node --experimental-sqlite --experimental-strip-types scripts/import-engine-data.ts --remote --all-scripts
 *
 * Options:
 *   --local | --remote     target (default: only write files under data/engine/, touch nothing)
 *   --all-scripts          upload every official + pre-release card script (~13.5k files),
 *                          instead of the base scripts + the test decks' cards
 *   --decks=a.json,b.json  also upload scripts for these decks ({ main: number[], extra: number[] })
 *   --cdb=PATH --scripts=DIR   override source locations
 *   --no-cards / --no-scripts  skip one half
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE_SCRIPTS } from "../src/worker/duel/engine/data.ts";
import { TEST_DECKS } from "../src/worker/duel/engine/testDecks.ts";
import { indexScripts, readCdb } from "./lib/engine-files.ts";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

const target = flag("--remote") ? "--remote" : flag("--local") ? "--local" : null;
const cdbPath = resolve(opt("cdb") ?? "data/vendor/babelcdb/cards.cdb");
const scriptsRoot = resolve(opt("scripts") ?? "data/vendor/cardscripts/CardScripts-master");
const outDir = resolve("data/engine");
const BUCKET = "ygo-platform-scripts";

function run(cmd: string) {
  console.log(`$ ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`command failed (${r.status}): ${cmd}`);
}
const sql = (v: string | number) => (typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

if (!existsSync(cdbPath)) throw new Error(`missing ${cdbPath} (see the header of this script)`);
if (!existsSync(join(scriptsRoot, "utility.lua"))) throw new Error(`missing CardScripts checkout at ${scriptsRoot}`);
mkdirSync(outDir, { recursive: true });

const scripts = indexScripts(scriptsRoot);
const cards = await readCdb(cdbPath, scripts);
console.log(`cards.cdb: ${cards.length} cards; CardScripts: ${scripts.size} scripts (${cards.filter((c) => c.has_script).length} cards have one)`);

// ---- cards -> D1 -------------------------------------------------------------------------
if (!flag("--no-cards")) {
  writeFileSync(join(outDir, "engine_cards.json"), JSON.stringify(cards));
  const cols = "id,alias,setcodes,type,level,attribute,race,atk,def,lscale,rscale,link_marker,ot,name,strings,has_script";
  const lines = ["DELETE FROM engine_cards;"];
  for (let i = 0; i < cards.length; i += 200) {
    const values = cards.slice(i, i + 200).map((c) => `(${[
      c.id, c.alias, sql(JSON.stringify(c.setcodes)), c.type, c.level, c.attribute, c.race, c.atk, c.def,
      c.lscale, c.rscale, c.link_marker, c.ot, sql(c.name), sql(JSON.stringify(c.strings)), c.has_script ? 1 : 0,
    ].join(",")})`);
    lines.push(`INSERT INTO engine_cards (${cols}) VALUES\n${values.join(",\n")};`);
  }
  const sqlPath = join(outDir, "engine_cards.sql");
  writeFileSync(sqlPath, lines.join("\n"));
  console.log(`wrote ${sqlPath}`);
  if (target) {
    run(`npx wrangler d1 migrations apply DB ${target}`);
    run(`npx wrangler d1 execute DB ${target} --file=${sqlPath} --yes`);
  }
}

// ---- scripts -> R2 -----------------------------------------------------------------------
if (!flag("--no-scripts")) {
  const wanted = new Set<string>(BASE_SCRIPTS);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const addCard = (code: number) => {
    if (scripts.has(`c${code}.lua`)) wanted.add(`c${code}.lua`);
  };
  if (flag("--all-scripts")) {
    for (const name of scripts.keys()) wanted.add(name);
  } else {
    const decks = [...TEST_DECKS, ...(opt("decks")?.split(",") ?? []).map((p) => JSON.parse(readFileSync(p, "utf8")))];
    const codes = new Set<number>(decks.flatMap((d) => [...d.main, ...d.extra]));
    // plus cards those scripts mention (tokens, "listed_names") — mirrors EngineData.preload
    for (const c of [...codes]) {
      const p = scripts.get(`c${c}.lua`);
      if (!p) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/\b(\d{5,9})\b/g)) if (byId.has(Number(m[1]))) codes.add(Number(m[1]));
    }
    const unknown = [...codes].filter((c) => !byId.has(c));
    if (unknown.length) console.warn(`not in cards.cdb: ${unknown.join(", ")}`);
    codes.forEach(addCard);
  }
  const missingBase = BASE_SCRIPTS.filter((s) => !scripts.has(s));
  if (missingBase.length) throw new Error(`CardScripts checkout lacks ${missingBase.join(", ")}`);

  // stage flat copies + a bulk-put manifest
  const stage = join(outDir, "scripts");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const manifest = [...wanted].map((name) => {
    const file = join(stage, name);
    copyFileSync(scripts.get(name)!, file);
    return { key: `scripts/${name}`, file };
  });
  const manifestPath = join(outDir, "scripts-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`staged ${manifest.length} scripts in ${stage}`);
  if (target) run(`npx wrangler r2 bulk put ${BUCKET} ${target} --filename=${manifestPath} --content-type=text/x-lua --concurrency=32`);
}
console.log("done");
