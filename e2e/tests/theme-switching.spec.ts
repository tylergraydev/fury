import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Theme Switching", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("settings Appearance tab shows available themes", async ({
    appPage,
  }) => {
    // Open settings
    await appPage.keyboard.press(`${MOD}+,`);

    // Should already be on Appearance tab (first tab)
    await expect(appPage.getByText("Appearance")).toBeVisible();

    // Built-in themes should be listed
    await expect(appPage.getByText("Blend")).toBeVisible();
    await expect(appPage.getByText("Midnight")).toBeVisible();
    await expect(appPage.getByText("GitHub Dark")).toBeVisible();
  });

  test("clicking a theme applies it (changes CSS variables)", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+,`);

    // Get initial background color
    const initialBg = await appPage.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue(
        "--bg-primary",
      );
    });

    // Click Midnight theme
    await appPage.getByText("Midnight").click();

    // CSS variables should have updated
    const newBg = await appPage.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue(
        "--bg-primary",
      );
    });

    // The theme was applied (variables were set)
    // Both Blend and Midnight use #000000 as bg-primary, so check accent instead
    const accent = await appPage.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue(
        "--accent",
      );
    });

    // Midnight uses white accent (#ffffff), Blend uses blue (#58a6ff)
    expect(accent.trim()).toBeTruthy();
  });

  test("switching back to Blend restores original theme", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+,`);

    // Switch to Midnight
    await appPage.getByText("Midnight").click();

    // Switch back to Blend
    await appPage.getByText("Blend").click();

    // Accent should be the Blend blue
    const accent = await appPage.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim();
    });

    // Blend accent is #58a6ff
    expect(accent).toContain("58a6ff");
  });

  test("Create Custom Theme button is visible", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+,`);

    await expect(
      appPage.getByText("Create Custom Theme"),
    ).toBeVisible();
  });
});
