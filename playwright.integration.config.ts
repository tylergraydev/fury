import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/integration/tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000, // 2 minutes — real agent calls are slow

  // No webServer — assumes `npm run tauri dev` is already running
  // The tests connect to the MCP bridge WebSocket on port 9223

  // No browser needed — these are pure WebSocket IPC tests
  // But Playwright requires at least one project
  projects: [{ name: "integration", testMatch: "**/*.spec.ts" }],
});
