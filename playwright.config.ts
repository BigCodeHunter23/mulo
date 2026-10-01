import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

/**
 * End-to-end tests run against a production build (`npm run build` first).
 *
 * Specs that only check signed-out behaviour need no database and run
 * anywhere. Specs that sign in need a non-production Supabase project and a
 * throwaway account, passed in as E2E_* variables; without them they skip.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: `${baseURL}/manifest.webmanifest`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
