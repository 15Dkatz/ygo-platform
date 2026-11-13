-- Finished duels, for "Recent duels" (match history). Player ids are identity ids: "u:<user id>" for
-- accounts, "g:<random>" for guests, "bot" for the bot.
CREATE TABLE IF NOT EXISTS matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id     TEXT NOT NULL,
    mode        TEXT NOT NULL,             -- "engine" (rules-enforced) | "manual"
    p0_id       TEXT, p0_name TEXT, p0_deck TEXT,
    p1_id       TEXT, p1_name TEXT, p1_deck TEXT,
    winner      INTEGER,                   -- 0 | 1 | NULL (draw)
    reason      TEXT,
    turns       INTEGER,
    started_at  TEXT,
    ended_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_p0 ON matches (p0_id, ended_at);
CREATE INDEX IF NOT EXISTS matches_p1 ON matches (p1_id, ended_at);
