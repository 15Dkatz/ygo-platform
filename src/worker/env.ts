export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  /** Rules-engine Lua scripts (phase 4), key "scripts/<name>". */
  SCRIPTS: R2Bucket;
  /** "1" enables GET /api/engine/selftest (dev only; set in .dev.vars). */
  ENGINE_SELFTEST?: string;
  DUEL_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

/** Hono context variables. `user` is set by the auth middleware (phase 2). */
export interface Vars {
  user: { id: string; username: string } | null;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
