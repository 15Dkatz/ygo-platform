# Third-party components

The rules-enforced duel mode (phase 4, `src/worker/duel/engine/`) runs third-party software
and data. Their sources and licenses:

| Component | What we use | Source | License |
| --- | --- | --- | --- |
| **ygopro-core** (EDOPro core, "ocgcore") by Edoardo Lolletti (edo9300) and contributors, derived from Fluorohydride's YGOPro core | The duel engine, compiled to WebAssembly and shipped in the Worker bundle (`ocgcore.sync.wasm`) | https://github.com/edo9300/ygopro-core | AGPL-3.0-or-later (original Fluorohydride parts MIT) — [`ygopro-core-LICENSE.txt`](ygopro-core-LICENSE.txt), [`AGPL-3.0.txt`](AGPL-3.0.txt) |
| **ocgcore-wasm** 0.1.6 by Simone Miraglia (n1xx1) | Emscripten build of ygopro-core + TypeScript bindings (npm `ocgcore-wasm`) | https://github.com/n1xx1/ocgcore-wasm | MIT for the bindings — [`ocgcore-wasm-MIT.txt`](ocgcore-wasm-MIT.txt); the WASM inside is ygopro-core, AGPL-3.0 |
| **ProjectIgnis CardScripts** by Project Ignis contributors | Lua card scripts + utility/procedure scripts, stored in R2 (`ygo-platform-scripts`) and executed by the engine | https://github.com/ProjectIgnis/CardScripts | AGPL-3.0-or-later — [`AGPL-3.0.txt`](AGPL-3.0.txt) |
| **ProjectIgnis BabelCDB** | `cards.cdb` card data (types, setcodes, stats, effect prompt strings), imported into D1 `engine_cards` | https://github.com/ProjectIgnis/BabelCDB | No license file in the repository (checked 2026-11-04). Attributed here; confirm terms with Project Ignis before a public launch. |

Card names, text and artwork are © Konami.

## What the AGPL requires of this project

ygopro-core and CardScripts are AGPL-3.0. Because the Worker runs them to provide a network
service to users, AGPL §13 applies:

1. **Offer the Corresponding Source to every user who interacts with the engine over the
   network**, at no charge — the engine, the card scripts, *and our own code that forms a
   single work with them* (at minimum the Worker that links the WASM and runs the scripts;
   in practice the simplest compliant route is to publish this whole repository under
   AGPL-3.0). The offer must be prominent, e.g. a "Source code" link in the duel UI / site
   footer. `GET /api/engine/source` lists the component sources; it must also point at
   this project's own public repository once it exists.
2. **Keep modifications available**: if we patch the core or any script, the modified
   version is what must be offered.
3. **Keep notices**: retain these license texts and copyright notices, and don't add
   restrictions beyond the AGPL.
4. MIT parts (ocgcore-wasm bindings, Fluorohydride core parts) only require keeping their
   copyright + permission notice, done in this folder.

Manual-mode-only deployments that never load the engine aren't affected, but the engine is
bundled into the same Worker, so treat the deployed Worker as AGPL-covered.
