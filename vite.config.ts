import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// One Worker serves both the API (/api/*, /img/*, /ws/*) and the built React app.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
