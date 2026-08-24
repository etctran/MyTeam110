import { defineConfig, devices } from "@playwright/test";

/**
 * Requires the local Supabase stack running (`pnpm supabase:start`) and
 * migrations applied — same as any other local dev session. Starts (or
 * reuses) the Next dev server itself via `webServer` below.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // shared local DB/users across spec files — must run fully serially
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
