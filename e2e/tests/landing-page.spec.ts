import { test, expect } from "../helpers/app";

test.describe("Landing Page", () => {
  test("renders header with Fury branding", async ({ appPage }) => {
    await expect(appPage.getByText("Fury", { exact: true })).toBeVisible();
    await expect(
      appPage.getByText("Multi-workspace conductor for Claude Code"),
    ).toBeVisible();
  });

  test("shows quick action cards", async ({ appPage }) => {
    await expect(appPage.getByText("Open Repository")).toBeVisible();
    await expect(appPage.getByText("Clone Repository")).toBeVisible();
    await expect(appPage.getByText("New AI Project")).toBeVisible();
  });

  test("displays mock repositories with workspace chips", async ({
    appPage,
  }) => {
    // Repo names shown as bold text within repo rows
    await expect(appPage.locator(".font-medium", { hasText: "fury" }).first()).toBeVisible();
    await expect(appPage.locator(".font-medium", { hasText: "acme-api" })).toBeVisible();

    // Workspace chips
    await expect(appPage.getByText("add-auth")).toBeVisible();
    await expect(appPage.getByText("redesign-sidebar")).toBeVisible();
    await expect(appPage.getByText("fix-pagination")).toBeVisible();
  });

  test("search filters repositories", async ({ appPage }) => {
    const searchInput = appPage.getByPlaceholder("Search repositories...");
    await searchInput.fill("acme");

    await expect(appPage.locator(".font-medium", { hasText: "acme-api" })).toBeVisible();
    // The "fury" repo's path should be hidden (the whole repo card disappears)
    await expect(appPage.getByText("/Users/demo/Code/fury", { exact: true })).not.toBeVisible();

    await searchInput.clear();
    // Both repos visible again
    await expect(appPage.locator(".font-medium", { hasText: "fury" }).first()).toBeVisible();
    await expect(appPage.locator(".font-medium", { hasText: "acme-api" })).toBeVisible();
  });

  test("shows keyboard shortcuts section", async ({ appPage }) => {
    await expect(appPage.getByText("Keyboard Shortcuts")).toBeVisible();
    await expect(appPage.getByText("Command Palette")).toBeVisible();
    await expect(appPage.getByText("New Workspace")).toBeVisible();
  });

  test("settings button opens settings overlay", async ({ appPage }) => {
    await appPage.getByTitle("Settings").click();
    await expect(appPage.getByText("Appearance")).toBeVisible();
  });
});
