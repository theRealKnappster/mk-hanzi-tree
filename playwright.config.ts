import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1024, height: 768 }, serviceWorkers: "block" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: process.env.HANZI_TEST_CHROMIUM ? { executablePath: process.env.HANZI_TEST_CHROMIUM, args: ["--no-sandbox", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer"] } : {} } },
    { name: "webkit", use: { ...devices["iPad Pro 11"], browserName: "webkit", viewport: { width: 1194, height: 834 } } },
  ],
  webServer: { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI },
});
