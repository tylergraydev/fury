import { test as base, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared Playwright fixture that injects Tauri IPC mocks
 * and waits for the React app to mount.
 */
export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    // Inject Tauri mock before any page JavaScript runs
    await page.addInitScript({
      path: path.resolve(__dirname, "../tauri-mock.js"),
    });

    await page.goto("/");

    // Wait for React to mount (the root div should have children)
    await page.waitForSelector("#root > *");

    await use(page);
  },
});

export { expect } from "@playwright/test";
