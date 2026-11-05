// Opt-in stress run: bot-vs-bot engine duels between real .ydk decks, to find engine gaps
// (crashes, stuck duels, responses the core rejects, unmapped hints, script errors).
//
//   STRESS_YDK_DIR="C:/Users/me/decks" STRESS_DUELS=200 npx vitest run src/worker/duel/engine/stress.test.ts
//
// Writes a JSON report to data/stress-report.json. Skipped unless STRESS_YDK_DIR is set.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseYdk } from "../../../shared/ydk.ts";
import { botResponse, seededRng } from "./bot.ts";
import { EngineDuel } from "./EngineDuel.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const DIR = process.env.STRESS_YDK_DIR;
const DUELS = Number(process.env.STRESS_DUELS ?? 100);
const MAX_STEPS = Number(process.env.STRESS_MAX_STEPS ?? 3000);
const ONLY = process.env.STRESS_ONLY ? Number(process.env.STRESS_ONLY) : null;

interface Failure { duel: number; decks: [string, string]; seed: number; kind: string; message: string; prompt?: string; steps: number }

describe.skipIf(!DIR || !engineDataAvailable)("engine stress (real decks)", () => {
  it("plays bot duels between the given decks", async () => {
    const decks = readdirSync(DIR!).filter((f) => f.toLowerCase().endsWith(".ydk")).sort().map((f) => {
      const p = parseYdk(readFileSync(join(DIR!, f), "utf8"));
      return { name: f.replace(/\.ydk$/i, ""), main: p.main, extra: p.extra };
    }).filter((d) => d.main.length >= 40);
    expect(decks.length).toBeGreaterThan(1);

    // capture core/script warnings (the adapter logs them through console.warn/error)
    const warnings = new Map<string, number>();
    const orig = { warn: console.warn, error: console.error };
    const scriptErrors = new Map<string, number>();
    const grab = (...a: unknown[]) => {
      const raw = a.map(String).join(" ");
      for (const m of raw.matchAll(/c(\d{5,})\.initial_effect/g)) scriptErrors.set(m[1], (scriptErrors.get(m[1]) ?? 0) + 1);
      const s = raw.replace(/c\d{5,}/g, "c#").slice(0, 200);
      warnings.set(s, (warnings.get(s) ?? 0) + 1);
    };
    console.warn = grab; console.error = grab;

    const core = await nodeCore();
    const { data } = nodeData();
    const failures: Failure[] = [];
    const kinds = new Map<string, number>();
    const unmappedHints = new Map<string, number>();
    const rejectedByKind = new Map<string, number>();
    let finished = 0, steps = 0, retries = 0, rebuilds = 0;
    const t0 = performance.now();

    for (let i = 0; i < DUELS; i++) {
      if (ONLY !== null && i !== ONLY) continue;
      const a = decks[i % decks.length], b = decks[(i * 7 + 3) % decks.length];
      const seed = 1000 + i;
      const names: [string, string] = [a.name, b.name];
      let duel: EngineDuel | null = null;
      let n = 0;
      let last = "";
      try {
        duel = await EngineDuel.create(core, data, {
          seed: [String(seed), String(seed * 7 + 1), String(seed * 13 + 2), String(seed * 31 + 3)],
          decks: [{ main: a.main, extra: a.extra }, { main: b.main, extra: b.extra }],
          names, first: (i % 2) as 0 | 1,
        });
        const rng = seededRng(seed);
        while (!duel.finished && n < MAX_STEPS) {
          const p = duel.prompt;
          if (!p) { failures.push({ duel: i, decks: names, seed, kind: "stuck", message: "no prompt but duel not finished", prompt: last, steps: n }); break; }
          kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
          const hint = (p as { hint?: string }).hint;
          if (hint && /^#\d+/.test(hint)) unmappedHints.set(hint, (unmappedHints.get(hint) ?? 0) + 1);
          last = `${p.kind} ${JSON.stringify(p).slice(0, 300)}`;
          const answer = botResponse(p, rng);
          await duel.respond(p.player, answer);
          if (duel.retries) {
            rejectedByKind.set(p.kind, (rejectedByKind.get(p.kind) ?? 0) + duel.retries); retries += duel.retries;
            failures.push({ duel: i, decks: names, seed, kind: "rejected", message: `core rejected ${JSON.stringify(answer)}`, prompt: JSON.stringify(p).slice(0, 1500), steps: n });
          }
          n++;
        }
        if (duel.finished) finished++;
        else if (n >= MAX_STEPS) failures.push({ duel: i, decks: names, seed, kind: "maxSteps", message: `no result after ${MAX_STEPS} responses`, prompt: last, steps: n });
        rebuilds += duel.rebuilds;
      } catch (e) {
        failures.push({ duel: i, decks: names, seed, kind: "exception", message: String((e as Error)?.stack ?? e).slice(0, 600), prompt: last, steps: n });
      }
      steps += n;
    }
    console.warn = orig.warn; console.error = orig.error;

    const sortMap = (m: Map<string, number>) => Object.fromEntries([...m].sort((x, y) => y[1] - x[1]));
    const byKind: Record<string, number> = {};
    for (const f of failures) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    const report = {
      decks: decks.length, duels: ONLY !== null ? 1 : DUELS, finished, failures: failures.length, byKind,
      steps, retries, rebuilds, seconds: Math.round((performance.now() - t0) / 1000),
      promptKinds: sortMap(kinds), rejectedByKind: sortMap(rejectedByKind), unmappedHints: sortMap(unmappedHints),
      scriptErrors: sortMap(scriptErrors),
      warnings: Object.fromEntries([...warnings].sort((x, y) => y[1] - x[1]).slice(0, 60)),
      failureList: failures,
    };
    writeFileSync("data/stress-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, failureList: undefined, warnings: undefined }, null, 2));
  }, 3_600_000);
});
