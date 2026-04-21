import { defineConfig } from "@playwright/test";

// The demo needs both server (3001) and client (5173) running. The root
// `pnpm dev` script starts both concurrently; reuseExistingServer lets a
// developer keep `pnpm dev` open and just run `pnpm test` on the side.
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "pnpm -w dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
