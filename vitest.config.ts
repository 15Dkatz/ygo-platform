import { defineConfig } from "vitest/config";

// Unit tests run in plain Node (WebCrypto is built in). The Cloudflare Vite plugin in
// vite.config.ts starts a Workers dev server, which vitest does not need.
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"], environment: "node" },
});
