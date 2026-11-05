import { defineConfig } from "vitest/config";

// Unit tests run in plain Node: vite.config.ts's Cloudflare plugin can't start inside vitest.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
