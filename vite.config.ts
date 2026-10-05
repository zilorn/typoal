import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [solidStart({ devOverlay: false }), nitro()],
  server: { port: 3000, strictPort: true },
  nitro: { preset: "node_server" },
});
