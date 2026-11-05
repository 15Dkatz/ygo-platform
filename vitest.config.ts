import { defineConfig } from "vitest/config";

// Tests run in plain Node (no Cloudflare plugin): the engine harness loads the WASM itself.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 300_000,
  },
});
