# ygo-platform

Yu-Gi-Oh duel site: Cloudflare Workers + Hono + D1 + a Durable Object per room (`DuelRoom`), React 19 + Vite client.
Rules engine: EDOPro's ocgcore as WASM, run **in the host player's browser** (free plan: no server CPU for it).
Live: https://ygo-platform.stevenbliu.workers.dev · repo stevenbliu/ygo-platform.

## Rules for working here
- **Never commit, push or deploy unless the user says so.** A push to `main` deploys (see CI below).
- After editing any duel CSS (`components/duel/scene/*.css`, `duel.css`, `duel-log.css`) run
  `python scripts/scaled-duel-css.py`: it regenerates the `/* scaled-copy */` blocks (desktop rules copied for the
  scaled 1920x1080 page). Never hand-edit inside those markers.
- Big files: grep for the section first, then read a line range. Don't read whole files over ~20 KB.
- **Keep this file current.** In the same change as the code, update it when you add, move, split or delete a
  file or folder named in the Map, add or change a command / script, or set up a new convention or rule. Edit the
  line that's wrong rather than appending notes; keep it a map, not a changelog (no history, no feature lists).
- Keep files small: when a file passes ~30 KB, split it along its sections (as `summonfx/`, `sound/`, `scene/`)
  and add the new layout to the Map.

## Commands
- `npm test` (vitest, ~190 tests) · `npm run typecheck` · `npm run build` (tsc + vite)
- `npm run dev:worker`: wrangler dev on :8788 serving the last build, with a memory guard (restarts past
  `DEV_MEM_LIMIT_MB`, log in `.wrangler/dev-memory.log`). `npm run dev` is plain vite.
- `npm run e2e`: Playwright smoke test (`e2e/*.e2e.ts`) against `BASE_URL` (default localhost:8788).
- `node scripts/long-demo.mjs [secs]`: long demo duel against localhost (memory diagnostics).
- CI (`.github/workflows/deploy.yml`) on push to main: tests, D1 migrations, deploy, e2e against the live site.

## Map
- `src/shared/`: types and pure logic used by both sides (duel.ts messages/board, duelActions, enginePrompts,
  autoPass, chain, clock, phases, roomSettings, sleeves, profile, rarity, starterDecks).
- `src/worker/`: `index.ts` (Hono app), `routes/` (auth, cards, decks, duel, engine, images), `auth/`.
  - `duel/DuelRoom.ts`: the room DO (seats, lobby, chat, clocks, bot, engine updates). Constants and stored
    shapes in `roomState.ts`; host-update checks in `hostUpdate.ts`.
  - Per-viewer masking (never leak hidden cards): `manual/mask.ts` (`maskBoard`), `engine/EngineDuel.ts`
    (`eventsFor`), `engine/publicView.ts`, `engine/promptMask.ts`. `engine/leaks.test.ts` guards this.
  - `duel/engine/`: ocgcore wrapper (core, decode, session, roomHook), bot, deck checks. `manual/`: no-engine mode.
- `src/client/pages/`: one per route. `DuelPage.tsx` is the duel screen; its hooks live in
  `components/duel/page/` (useHoverPreview, useAutoPlay, useDuelEnd, useBoardFeedback). `ReplayPage`, `SummonLab`
  (`/dev/summons`), `FxLab`, `FoilLab` are labs / viewers.
- `src/client/components/duel/`: board and UI. `Board.tsx`, `DuelParts.tsx` (player bar, phase cells, Now panel...),
  `DuelFx.tsx` (turn banner, end overlay), `PreDuel.tsx` (room setup), `useDuel.ts` (socket + card data),
  `uiScale.ts` (scaled page), `duelSettings.ts` (⚙ settings), `replay.ts` (IndexedDB replays).
  - CSS: `duel-scene.css` only `@import`s `scene/*.css` **in order** (base, board, panels, resolve, clocks, late);
    later files override earlier ones, so keep the order.
- `src/client/components/duel/anim/`: animation pipeline: `intents.ts` (engine events -> intents) ->
  `animator.ts` (capture / play, WAAPI) -> `summonFx.ts` (public API; code in `summonfx/` core, summon, activate,
  splash) and `fx.ts`, `resolveFx.ts`. Sound: `sfx.ts` (play, music, public API; `sound/synth.ts` building blocks,
  `sound/themes.ts` per-theme sounds).
- `src/client/components/engine/`: engine prompts UI and the in-browser host runtime (`hostRuntime.ts`).
- `scripts/`: card / engine data import, CSS generators, dev server guard, diagnostics.
