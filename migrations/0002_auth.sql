-- Phase 2: user accounts, sessions, per-user decks and custom tags.

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,                        -- uuid
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,     -- shown as typed, unique ignoring case
    password_hash TEXT NOT NULL,                           -- "pbkdf2-sha256$<iterations>$<base64 hash>"
    salt          TEXT NOT NULL,                           -- base64, 16 random bytes per user
    created_at    TEXT NOT NULL                            -- ISO timestamp
);

-- Only a SHA-256 of the session token is stored; the token itself lives in the cookie.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,                           -- hex SHA-256 of the 32-byte token
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,                           -- unix ms
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Deck ids are client-generated uuids, so the key is scoped per user.
CREATE TABLE IF NOT EXISTS decks (
    id            TEXT NOT NULL,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    main          TEXT NOT NULL DEFAULT '[]',              -- JSON array of card ids
    extra         TEXT NOT NULL DEFAULT '[]',
    side          TEXT NOT NULL DEFAULT '[]',
    file_modified TEXT,
    file_created  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);

CREATE TABLE IF NOT EXISTS user_tags (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,                               -- lower-cased card name
    tag       TEXT NOT NULL,
    PRIMARY KEY (user_id, card_name, tag)
);

-- Failed logins / registrations, for rate limiting. key = "login:<username>:<ip>" etc.
CREATE TABLE IF NOT EXISTS auth_attempts (
    key          TEXT NOT NULL,
    attempted_at INTEGER NOT NULL                          -- unix ms
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_key ON auth_attempts(key, attempted_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_time ON auth_attempts(attempted_at);
