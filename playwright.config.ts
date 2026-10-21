import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.TEST_BASE_URL ||
      (process.env.TEST_PRODUCTION
        ? "http://127.0.0.1:3100"
        : "http://127.0.0.1:3000"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.TEST_PRODUCTION
      ? "npm run start -- --hostname 127.0.0.1 --port 3100"
      : "npm run dev -- --hostname 127.0.0.1",
    url: process.env.TEST_PRODUCTION
      ? "http://127.0.0.1:3100"
      : "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI && !process.env.TEST_PRODUCTION,
    timeout: 120000,
  },
});
