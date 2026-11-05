import { Hono } from "hono";
import type { AppEnv } from "../env.ts";

export const images = new Hono<AppEnv>();

// YGOPRODeck asks sites not to hotlink, so each image is fetched once and kept in R2.
const SOURCES = {
  small: "https://images.ygoprodeck.com/images/cards_small/",
  full: "https://images.ygoprodeck.com/images/cards/",
  crop: "https://images.ygoprodeck.com/images/cards_cropped/",
} as const;

/** GET /img/:size/:id.jpg  (size = small | full | crop) */
images.get("/:size{small|full|crop}/:file{[0-9]+\\.jpg}", async (c) => {
  const size = c.req.param("size") as keyof typeof SOURCES;
  const file = c.req.param("file");
  const key = `${size}/${file}`;
  const headers = { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=2592000, immutable" };

  const hit = await c.env.IMAGES.get(key);
  if (hit) return new Response(hit.body, { headers });

  const upstream = await fetch(SOURCES[size] + file, { headers: { "User-Agent": "ygo-platform/0.1 (image cache)" } });
  if (!upstream.ok || !upstream.body) return c.body(null, upstream.status === 404 ? 404 : 502);
  const bytes = await upstream.arrayBuffer();
  c.executionCtx.waitUntil(c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } }));
  return new Response(bytes, { headers });
});
