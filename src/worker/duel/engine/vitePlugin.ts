import type { Plugin } from "vite";

/**
 * `ocgcore-wasm` lazily imports two chunks that each hold the whole WASM as base64 (~1.3 MB
 * each), used only when no wasm binary is supplied. We always pass the compiled module
 * (`import ... from "ocgcore-wasm/lib/ocgcore.sync.wasm"`), so replace those chunks with
 * empty stubs to keep ~0.9 MB (gzip) of dead weight out of the Worker bundle.
 */
export function ocgcoreWasmStub(): Plugin {
  return {
    name: "ocgcore-wasm-stub",
    enforce: "pre",
    load(id) {
      if (!/ocgcore-wasm[\\/]dist[\\/]ocgcore\.(sync|jspi)-[A-Z0-9]+\.js$/.test(id)) return null;
      return import("node:fs").then(({ readFileSync }) => {
        const code = readFileSync(id, "utf8");
        // the inlined-binary chunks start with a base64 "\0asm" header ("AGFzbQ")
        return code.includes('("AGFzbQ') ? "export default new Uint8Array(0);" : null;
      });
    },
  };
}
