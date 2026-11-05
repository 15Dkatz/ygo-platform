-- Card catalogue, imported from the YGOPRODeck API by scripts/import-cards.ts.
-- Same columns as the Python script's `cards` table (minus sets_json/fetched_at).
CREATE TABLE IF NOT EXISTS cards (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    type         TEXT,
    kind         TEXT,
    category     TEXT,
    race         TEXT,
    attribute    TEXT,
    level        INTEGER,
    atk          INTEGER,
    defense      INTEGER,
    linkval      INTEGER,
    linkmarkers  TEXT,              -- JSON array, e.g. ["Top","Bottom-Left"]
    scale        INTEGER,
    archetype    TEXT,
    desc         TEXT,
    tcg_date     TEXT,
    ocg_date     TEXT,
    release_date TEXT,
    konami_id    INTEGER,
    staple       INTEGER,
    views        INTEGER,
    viewsweek    INTEGER,
    upvotes      INTEGER,
    downvotes    INTEGER,
    ban_tcg      TEXT,
    ban_ocg      TEXT,
    ban_goat     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);

-- Alternate-art / alias passwords -> canonical card id (.ydk files may use either).
CREATE TABLE IF NOT EXISTS card_alias (
    alias_id INTEGER PRIMARY KEY,
    card_id  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
