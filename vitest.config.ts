import { defineConfig } from "vitest/config";

// Unit tests run in plain Node (WebCrypto is built in; the engine harness loads the WASM itself).
// The Cloudflare Vite plugin in vite.config.ts starts a Workers dev server, which vitest does not need.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
  },
});
