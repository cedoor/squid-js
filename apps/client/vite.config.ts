import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Needed for SharedArrayBuffer / cross-origin isolation if we later want
    // wasm threading; harmless for the single-threaded demo.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@squid-js/core"],
  },
  build: {
    target: "es2022",
  },
});
