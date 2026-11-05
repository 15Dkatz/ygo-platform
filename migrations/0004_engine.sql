-- Rules-engine card data (phase 4), imported from ProjectIgnis BabelCDB `cards.cdb` by
-- scripts/import-engine-data.ts. Kept apart from `cards` (YGOPRODeck) because the engine
-- needs the core's own bit values and archetype setcodes, which YGOPRODeck doesn't have.
CREATE TABLE IF NOT EXISTS engine_cards (
    id          INTEGER PRIMARY KEY,   -- passcode
    alias       INTEGER NOT NULL DEFAULT 0,
    setcodes    TEXT NOT NULL DEFAULT '[]',  -- JSON array of 16-bit setcodes (cdb packs 4 into an int64)
    type        INTEGER NOT NULL DEFAULT 0,  -- TYPE_* bits
    level       INTEGER NOT NULL DEFAULT 0,  -- level / rank / link rating
    attribute   INTEGER NOT NULL DEFAULT 0,  -- ATTRIBUTE_* bits
    race        INTEGER NOT NULL DEFAULT 0,  -- RACE_* bits
    atk         INTEGER NOT NULL DEFAULT 0,
    def         INTEGER NOT NULL DEFAULT 0,  -- 0 for Link monsters
    lscale      INTEGER NOT NULL DEFAULT 0,
    rscale      INTEGER NOT NULL DEFAULT 0,
    link_marker INTEGER NOT NULL DEFAULT 0,
    ot          INTEGER NOT NULL DEFAULT 0,  -- OCG/TCG/... availability bits
    name        TEXT NOT NULL DEFAULT '',
    strings     TEXT NOT NULL DEFAULT '[]',  -- JSON array of str1..str16 (effect prompt texts)
    has_script  INTEGER NOT NULL DEFAULT 0   -- 1 if c<id>.lua exists in the SCRIPTS bucket
);
