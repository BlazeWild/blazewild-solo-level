import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "DB_PATH=data/e2e/level-up.sqlite npm run dev",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
