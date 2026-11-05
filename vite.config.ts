import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { ocgcoreWasmStub } from "./src/worker/duel/engine/vitePlugin.ts";

// One Worker serves both the API (/api/*, /img/*, /ws/*) and the built React app.
export default defineConfig({
  plugins: [ocgcoreWasmStub(), react(), cloudflare()],
});
