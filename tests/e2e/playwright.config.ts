import { defineConfig, devices } from "@playwright/test";

/**
 * Happy paths del vertical Retail en navegador (§4 de
 * docs/plan-liberacion-retail-25sep.md). Levanta la API y las dos apps web,
 * siempre contra la base LOCAL: nunca apuntar a producción.
 *
 *   set -a && . .env && set +a
 *   pnpm e2e
 */
const API = "http://127.0.0.1:3000";
const ADMIN = "http://127.0.0.1:5174";
const POS = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts/,
  globalSetup: "./siembra.ts",
  // El POS y el panel comparten tenant: en paralelo se pisan el stock y la caja.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: ADMIN,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "panel",
      testMatch: /panel\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN },
    },
    { name: "pos", testMatch: /pos\.e2e\.ts/, use: { ...devices["Desktop Chrome"], baseURL: POS } },
  ],
  webServer: [
    {
      command: "pnpm --filter @gaespos/api dev",
      url: `${API}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @gaespos/web-admin dev",
      url: ADMIN,
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @gaespos/web-pos dev",
      url: POS,
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
  ],
});
