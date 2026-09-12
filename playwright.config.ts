import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".cache/playwright");
const testDataDirectory = `e2e-${Date.now()}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      MOLOT_DATA_DIR: "",
      MOLOT_DATA_SUBDIR: testDataDirectory,
      NEXT_TELEMETRY_DISABLED: "1",
      MOLOT_TEST_BUILD: "1",
    },
  },
});
