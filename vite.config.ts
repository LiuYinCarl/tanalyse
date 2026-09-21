import { defineConfig } from "vite";

// Tauri expects a fixed dev port; the frontend is bundled into the binary on build.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
