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

## Legal

Card names, text and images are © Konami. Card data from [YGOPRODeck](https://ygoprodeck.com/api-guide/).
This is a non-commercial fan project.
