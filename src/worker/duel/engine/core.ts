// Loads the EDOPro core (ocgcore, AGPL-3.0) compiled to WebAssembly by the `ocgcore-wasm`
// package (MIT bindings). We use the package's *sync* build: Workers cannot block on I/O
// from inside a WASM call, so every card row and Lua script a duel needs is fetched
// up front and served from memory (see EngineDuel's missing-script retry for the rest).
//
// The WASM is passed in as an already-compiled `WebAssembly.Module`: on Workers it comes
// from a static `import ... from "*.wasm"` (Workers forbid compiling fetched bytes at
// runtime); in Node tests it is compiled from the file on disk.

import createCore, { type OcgCoreSync } from "ocgcore-wasm";

let corePromise: Promise<OcgCoreSync> | null = null;

/** One core instance per isolate; a core can host many duels (one per room/replay). */
export function loadCore(getModule: () => WebAssembly.Module | Promise<WebAssembly.Module>): Promise<OcgCoreSync> {
  corePromise ??= (async () => {
    const mod = await getModule();
    return createCore({
      sync: true,
      // Any locateFile stops the package from importing its own base64 copy of the wasm.
      locateFile: (url: string) => url,
      instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
        WebAssembly.instantiate(mod, imports).then((instance) => done(instance, mod));
        return {};
      },
      print: () => {},
      printErr: (s: string) => console.warn("[ocgcore]", s),
    });
  })();
  corePromise.catch(() => { corePromise = null; });
  return corePromise;
}
