import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "go run ./cmd/blog",
      cwd: "backend",
      url: "http://127.0.0.1:8180/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ADMIN_PASSWORD: "typoal-e2e-password",
        DATABASE_PATH: `/tmp/typoal-e2e-${process.pid}.db`,
        API_ADDR: "0.0.0.0:8180",
        COOKIE_SECURE: "false",
        GOCACHE: process.env.GOCACHE || "/tmp/typoal-go-cache",
      },
    },
    {
      command: "node .output/server/index.mjs",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: { HOST: "0.0.0.0", PORT: "3100", API_URL: "http://127.0.0.1:8180" },
    },
  ],
});
