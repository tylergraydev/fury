import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, getThemeNames } from "./themes";

beforeEach(() => {
  // Clear any previously set CSS vars
  const root = document.documentElement;
  root.style.cssText = "";
});

describe("applyTheme", () => {
  it("sets all CSS variables on document root for blend theme", () => {
    applyTheme("blend");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#000000");
    expect(root.style.getPropertyValue("--accent")).toBe("#3b82f6");
    expect(root.style.getPropertyValue("--text-primary")).toBe("#f0f6fc");
  });

  it("sets CSS variables for midnight theme", () => {
    applyTheme("midnight");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#000000");
    expect(root.style.getPropertyValue("--accent")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--bg-secondary")).toBe("#0a0a0a");
  });

  it("sets CSS variables for github theme", () => {
    applyTheme("github");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#0d1117");
    expect(root.style.getPropertyValue("--text-secondary")).toBe("#c9d1d9");
  });

  it("overrides previous theme values when switching", () => {
    applyTheme("blend");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#3b82f6");

    applyTheme("midnight");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ffffff");
  });

  it("sets all 16 expected CSS variables", () => {
    applyTheme("blend");
    const root = document.documentElement;
    const expectedVars = [
      "--bg-primary", "--bg-secondary", "--bg-surface", "--bg-hover",
      "--text-primary", "--text-secondary", "--text-muted",
      "--border", "--accent", "--accent-hover",
      "--accent-green", "--accent-purple", "--accent-orange",
      "--success", "--warning", "--error",
    ];
    for (const v of expectedVars) {
      expect(root.style.getPropertyValue(v)).toBeTruthy();
    }
  });
});

describe("getThemeNames", () => {
  it("returns all theme names", () => {
    const names = getThemeNames();
    expect(names).toContain("blend");
    expect(names).toContain("midnight");
    expect(names).toContain("github");
  });

  it("returns exactly 3 themes", () => {
    expect(getThemeNames()).toHaveLength(3);
  });
});
