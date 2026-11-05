-- Rules-engine Lua scripts (ProjectIgnis CardScripts, AGPL-3.0), imported by
-- scripts/import-engine-data.ts. Kept in D1 (~30 MB) so the app needs no R2 bucket.
CREATE TABLE IF NOT EXISTS engine_scripts (
    name TEXT PRIMARY KEY,   -- e.g. "c89631139.lua", "utility.lua"
    body TEXT NOT NULL
);
