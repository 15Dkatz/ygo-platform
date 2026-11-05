import { Hono } from "hono";
import type { AppEnv } from "./env.ts";
import { cards } from "./routes/cards.ts";
import { images } from "./routes/images.ts";
import { auth, authMiddleware } from "./routes/auth.ts";
import { decks } from "./routes/decks.ts";
import { duel } from "./routes/duel.ts";
import { engine } from "./routes/engine.ts";

export { DuelRoom } from "./duel/DuelRoom.ts";

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);       // sets c.var.user (null when signed out)
app.route("/api/cards", cards);          // phase 1: catalogue search / lookup
app.route("/img", images);               // phase 1: R2-cached card images
app.route("/api/auth", auth);            // phase 2: accounts
app.route("/api/decks", decks);          // phase 2: decks saved per user
app.route("/", duel);                    // phase 3/4: /api/rooms/*, /ws/room/:id
app.route("/api/engine", engine);        // phase 4: rules-engine source offer + selftest

app.get("/api/health", (c) => c.json({ ok: true }));
app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
