# YGO Duel Hub

A Yu-Gi-Oh! card library, deck builder and online dueling platform, running entirely on
Cloudflare (Workers + static assets, D1, R2, Durable Objects). It started as a port of the
`ygo_library_enhanced.py` command-line tool.

## Run locally

```bash
npm install
npm run cards:import:local   # downloads ~14k cards from YGOPRODeck into local D1
npm run dev                  # http://localhost:5173
```

## Layout

| Path | What |
| --- | --- |
| `src/shared/` | Types and logic shared by Worker and client (`types.ts`, `duel.ts` are contracts) |
| `src/worker/` | Hono API: `routes/cards.ts`, `images.ts`, `auth.ts`, `decks.ts`, `duel.ts`; `duel/DuelRoom.ts` Durable Object |
| `src/client/` | React app: `pages/*`, `store/deckStore.ts`, `api.ts`, `styles.css` (design tokens) |
| `migrations/` | D1 migrations, numbered: 0001 cards, 0002 auth/decks, 0003+ duels |
| `scripts/import-cards.ts` | Catalogue import from YGOPRODeck |

## Conventions

- Colours come from the tokens in `src/client/styles.css`; page-specific CSS goes in a file next to the page.
- Card images always go through `/img/{small|full|crop}/{id}.jpg` (`cardImage()` in `api.ts`), never YGOPRODeck URLs directly.
- Pages read and write decks only through `useDeckStore()`.
- D1 statements bind at most ~90 parameters; chunk bigger `IN (...)` lists.

## Rules engine (phase 4)

Rules-enforced duels run EDOPro's core (ygopro-core, AGPL-3.0) as WebAssembly inside the
DuelRoom Durable Object (`src/worker/duel/engine/`), with ProjectIgnis card scripts in R2
(`SCRIPTS`) and BabelCDB card data in D1 (`engine_cards`). Setup — download the sources into
`data/vendor/` as described at the top of `scripts/import-engine-data.ts`, then:

```bash
npm run engine:import:local    # engine_cards -> local D1, base + test-deck scripts -> local R2
npx vitest run src/worker/duel/engine   # bot-vs-bot duels through the adapter (Node)
```

The engine is AGPL-3.0: see `LICENSES/NOTICE.md` for what that requires of a deployment.

## Deploy (Cloudflare)

Needs the Workers Paid plan: rules-engine duel creation and password hashing exceed the free plan's 10 ms CPU limit.

```bash
npx wrangler login
npx wrangler d1 create ygo-platform          # put the printed database_id into wrangler.jsonc
npx wrangler r2 bucket create ygo-platform-images
npx wrangler r2 bucket create ygo-platform-scripts
npm run db:migrate:remote
npm run cards:import:remote                  # ~14.6k cards from YGOPRODeck
npm run engine:import:remote                 # engine card data + all ~13.5k card scripts
npm run deploy
```

Set `SOURCE_URL` in `src/shared/project.ts` to the public repository first (AGPL §13).

## License

AGPL-3.0-or-later (see `LICENSE`), because the bundled rules engine (ygopro-core) and card
scripts are AGPL-3.0. Third-party notices: `LICENSES/NOTICE.md`.

## Legal

Card names, text and images are © Konami. Card data from [YGOPRODeck](https://ygoprodeck.com/api-guide/).
This is a non-commercial fan project.
