// `npm run build` must ship the engine WASM inside the Worker and stay under the 10 MB
// (paid plan) compressed Worker size limit. Runs the real build (~10-30 s).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const OUT = resolve("dist/ygo_platform");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe.skipIf(process.env.SKIP_BUILD_TEST === "1")("worker bundle", () => {
  it("includes the ocgcore WASM and stays under 10 MB gzipped (3 MB free tier)", () => {
    execSync("npm run build", { stdio: "pipe" });
    const shipped = files(OUT).filter((f) => !f.endsWith(".map") && !f.includes(".vite") && !f.endsWith("wrangler.json") && !f.endsWith(".dev.vars"));
    const wasm = shipped.filter((f) => f.endsWith(".wasm"));
    expect(wasm.length).toBe(1);
    expect(readFileSync(wasm[0]).subarray(0, 4)).toEqual(Buffer.from([0, 0x61, 0x73, 0x6d]));   // "\0asm"
    const raw = shipped.reduce((n, f) => n + statSync(f).size, 0);
    const gz = shipped.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
    console.log(`worker bundle: ${shipped.length} files, ${(raw / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzip (wasm ${(statSync(wasm[0]).size / 1e6).toFixed(2)} MB raw)`);
    // the package's base64 copies of the wasm must have been stubbed out (vitePlugin.ts)
    for (const f of shipped.filter((x) => x.endsWith(".js"))) expect(readFileSync(f, "utf8").includes('"AGFzbQ')).toBe(false);
    expect(gz).toBeLessThan(10 * 1024 * 1024);
    expect(gz).toBeLessThan(3 * 1024 * 1024);
  });
});
