import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: { alias: (process.platform === "win32" || process.env.CSTMSKN_BUILD_PLATFORM === "windows")
    ? [{ find: /^.*\/SystemIcon$/, replacement: fileURLToPath(new URL("./src/components/SystemIcon.windows.tsx", import.meta.url)) }]
    : [] },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});
