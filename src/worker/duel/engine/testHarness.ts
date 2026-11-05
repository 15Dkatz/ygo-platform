// Node-only setup for engine tests: compiles the WASM from node_modules, and serves card rows
// from data/engine/engine_cards.json + scripts from the CardScripts checkout under data/vendor.
// (Both come from `scripts/import-engine-data.ts`; see its header.)

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileSource, indexScripts } from "../../../../scripts/lib/engine-files.ts";
import { loadCore } from "./core.ts";
import { EngineData, type EngineCardRow } from "./data.ts";

export const CARDS_JSON = resolve("data/engine/engine_cards.json");
export const SCRIPTS_ROOT = resolve("data/vendor/cardscripts/CardScripts-master");
export const WASM_PATH = createRequire(import.meta.url).resolve("ocgcore-wasm/lib/ocgcore.sync.wasm");

export const engineDataAvailable = existsSync(CARDS_JSON) && existsSync(resolve(SCRIPTS_ROOT, "utility.lua"));

export function nodeCore() {
  return loadCore(() => new WebAssembly.Module(readFileSync(WASM_PATH)));
}

let cached: { cards: Map<number, EngineCardRow>; scripts: Map<string, string> } | null = null;
export function nodeData() {
  cached ??= {
    cards: new Map((JSON.parse(readFileSync(CARDS_JSON, "utf8")) as EngineCardRow[]).map((r) => [r.id, r])),
    scripts: indexScripts(SCRIPTS_ROOT),
  };
  const source = fileSource(cached.cards, cached.scripts);
  return { data: new EngineData(source), source };
}
