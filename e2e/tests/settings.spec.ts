import { test, expect } from "../helpers/app";

test.describe("Settings", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Open Settings via command palette
    await appPage.keyboard.press("Control+k");
    await appPage.locator(".command-palette").getByText("Open Settings").click();
  });

  test("settings overlay opens with navigation tabs", async ({ appPage }) => {
    // Settings heading should be visible
    await expect(appPage.getByText("Settings").first()).toBeVisible();

    // Navigation items should be visible
    await expect(appPage.getByText("Appearance")).toBeVisible();
    await expect(appPage.getByText("Provider")).toBeVisible();
    await expect(appPage.getByText("Copilot")).toBeVisible();
    await expect(appPage.getByText("MCP Servers")).toBeVisible();
    await expect(appPage.getByText("Experimental")).toBeVisible();
    await expect(appPage.getByText("Updates")).toBeVisible();
  });

  test("Appearance tab shows theme cards with active badge", async ({
    appPage,
  }) => {
    // Appearance should be active by default
    // Theme cards should show
    await expect(appPage.getByText("Blend")).toBeVisible();
    await expect(appPage.getByText("Midnight")).toBeVisible();
    await expect(appPage.getByText("GitHub Dark")).toBeVisible();

    // The "blend" theme should be active (from mock settings)
    await expect(appPage.getByText("Active")).toBeVisible();
  });

  test("clicking a different theme selects it", async ({ appPage }) => {
    // Click the Midnight theme card
    await appPage.locator("button", { hasText: "Midnight" }).click();

    // The Active badge should move to Midnight
    const midnightCard = appPage.locator("button", { hasText: "Midnight" });
    await expect(midnightCard.getByText("Active")).toBeVisible();
  });

  test("Provider tab shows provider dropdown and env var config", async ({
    appPage,
  }) => {
    // Navigate to Provider tab
    await appPage.getByText("Provider").click();

    // Provider label should be visible
    await expect(appPage.getByText("Provider").first()).toBeVisible();

    // Provider select dropdown should have Anthropic selected
    const providerSelect = appPage.locator("select").first();
    await expect(providerSelect).toHaveValue("Anthropic");

    // Anthropic provider shows ANTHROPIC_API_KEY hint
    await expect(appPage.getByText("ANTHROPIC_API_KEY")).toBeVisible();

    // Save and Cancel buttons should be visible
    await expect(
      appPage.locator("button", { hasText: "Save" }),
    ).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "Cancel" }),
    ).toBeVisible();
  });

  test("Experimental tab shows feature toggles", async ({ appPage }) => {
    // Navigate to Experimental tab
    await appPage.getByText("Experimental").click();

    // Feature toggle labels
    await expect(appPage.getByText("Spotlight Testing")).toBeVisible();
    await expect(appPage.getByText("Agent Teams")).toBeVisible();

    // Warning text
    await expect(
      appPage.getByText("experimental and may change"),
    ).toBeVisible();
  });

  test("MCP Servers tab shows empty state with Add button", async ({
    appPage,
  }) => {
    // Navigate to MCP Servers tab
    await appPage.getByText("MCP Servers").click();

    // Mock returns empty MCP servers list
    await expect(
      appPage.getByText("No MCP servers configured"),
    ).toBeVisible();

    // Add MCP Server button should be visible
    await expect(
      appPage.locator("button", { hasText: "Add MCP Server" }),
    ).toBeVisible();
  });

  test("Add MCP Server form opens and shows inputs", async ({ appPage }) => {
    // Navigate to MCP Servers tab
    await appPage.getByText("MCP Servers").click();

    // Click Add MCP Server
    await appPage.locator("button", { hasText: "Add MCP Server" }).click();

    // Form inputs should appear
    await expect(
      appPage.getByPlaceholder("Server name"),
    ).toBeVisible();
    await expect(
      appPage.getByPlaceholder("Command (e.g. npx, node)"),
    ).toBeVisible();

    // Scope radio buttons
    await expect(appPage.getByText("User")).toBeVisible();
    await expect(appPage.getByText("Project")).toBeVisible();

    // Cancel and Add Server buttons
    await expect(
      appPage.locator("button", { hasText: "Cancel" }).first(),
    ).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "Add Server" }),
    ).toBeVisible();
  });

  test("Updates tab shows version and check button", async ({ appPage }) => {
    // Navigate to Updates tab
    await appPage.getByText("Updates").click();

    // Should show current version
    await expect(appPage.getByText("v0.1.0")).toBeVisible();

    // Check for Updates button
    await expect(
      appPage.locator("button", { hasText: "Check for Updates" }),
    ).toBeVisible();
  });
});
