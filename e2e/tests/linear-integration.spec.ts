import { test, expect } from "../helpers/app";

test.describe("Linear Integration", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("plus menu shows Link issue option", async ({ appPage }) => {
    const plusBtn = appPage.locator("button[title='Add file or context']");
    await plusBtn.click();

    await expect(appPage.getByText("Link issue")).toBeVisible();
  });

  test("plus menu shows Add attachment option", async ({ appPage }) => {
    const plusBtn = appPage.locator("button[title='Add file or context']");
    await plusBtn.click();

    await expect(appPage.getByText("Add attachment")).toBeVisible();
  });

  test("Link issue button is enabled for workspace context", async ({
    appPage,
  }) => {
    const plusBtn = appPage.locator("button[title='Add file or context']");
    await plusBtn.click();

    // The Link issue button should not be fully transparent (opacity-40 means disabled)
    const linkBtn = appPage
      .locator("button")
      .filter({ hasText: "Link issue" });
    await expect(linkBtn).toBeVisible();

    // Check it's not using the disabled style (opacity-40 class)
    const classes = await linkBtn.getAttribute("class");
    expect(classes).not.toContain("opacity-40");
  });

  test("plus menu closes when clicking outside", async ({ appPage }) => {
    const plusBtn = appPage.locator("button[title='Add file or context']");
    await plusBtn.click();
    await expect(appPage.getByText("Link issue")).toBeVisible();

    // Click outside to close
    await appPage.locator("#root").click({ position: { x: 100, y: 300 } });
    await expect(appPage.getByText("Link issue")).not.toBeVisible();
  });
});
