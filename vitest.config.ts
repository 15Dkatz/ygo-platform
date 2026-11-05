import { defineConfig } from "vitest/config";

// Unit tests run in plain Node (no Cloudflare plugin): only pure modules are tested here.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
