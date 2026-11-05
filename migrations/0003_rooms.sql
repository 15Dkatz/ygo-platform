-- Lobby index of duel rooms. The DuelRoom Durable Object is the source of truth and
-- upserts its row whenever seats / status change; it deletes the row when the room closes.
CREATE TABLE IF NOT EXISTS rooms (
    room_id    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    mode       TEXT NOT NULL,              -- 'manual' | 'engine'
    host       TEXT NOT NULL,              -- display name of the creator
    players    TEXT NOT NULL DEFAULT '[]', -- JSON array of seated display names
    status     TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'dueling' | 'finished'
    spectators INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status, updated_at);
