import { describe, it, expect, beforeEach } from "vitest";
import {
  applyTheme,
  applyThemeVars,
  getThemeNames,
  getThemeVars,
  registerCustomTheme,
  unregisterCustomTheme,
  clearCustomThemes,
  builtInThemes,
  THEME_VAR_GROUPS,
} from "./themes";

beforeEach(() => {
  const root = document.documentElement;
  root.style.cssText = "";
  clearCustomThemes();
});

describe("applyTheme", () => {
  it("sets all CSS variables on document root for blend theme", () => {
    applyTheme("blend");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#000000");
    expect(root.style.getPropertyValue("--accent")).toBe("#58a6ff");
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
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#58a6ff");

    applyTheme("midnight");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ffffff");
  });

  it("sets all 19 expected CSS variables", () => {
    applyTheme("blend");
    const root = document.documentElement;
    const expectedVars = Object.keys(builtInThemes.blend);
    for (const v of expectedVars) {
      expect(root.style.getPropertyValue(v)).toBeTruthy();
    }
    expect(expectedVars).toHaveLength(19);
  });

  it("falls back to blend for unknown theme names", () => {
    applyTheme("nonexistent-theme");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#000000");
    expect(root.style.getPropertyValue("--accent")).toBe("#58a6ff");
  });

  it("applies a registered custom theme", () => {
    const customVars = { ...builtInThemes.blend, "--accent": "#ff0000" };
    registerCustomTheme("custom-test", customVars);
    applyTheme("custom-test");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff0000");
  });
});

describe("applyThemeVars", () => {
  it("sets CSS variables from a ThemeVars object directly", () => {
    const vars = { ...builtInThemes.midnight, "--accent": "#00ff00" };
    applyThemeVars(vars);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--accent")).toBe("#00ff00");
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#000000");
  });
});

describe("getThemeNames", () => {
  it("returns all built-in theme names", () => {
    const names = getThemeNames();
    expect(names).toContain("blend");
    expect(names).toContain("midnight");
    expect(names).toContain("github");
  });

  it("returns exactly 3 built-in themes", () => {
    expect(getThemeNames()).toHaveLength(3);
  });
});

describe("getThemeVars", () => {
  it("returns vars for built-in themes", () => {
    expect(getThemeVars("blend")).toBe(builtInThemes.blend);
    expect(getThemeVars("midnight")).toBe(builtInThemes.midnight);
  });

  it("returns vars for registered custom themes", () => {
    const customVars = { ...builtInThemes.blend, "--accent": "#abcdef" };
    registerCustomTheme("custom-x", customVars);
    expect(getThemeVars("custom-x")).toBe(customVars);
  });

  it("returns undefined for unknown themes", () => {
    expect(getThemeVars("nonexistent")).toBeUndefined();
  });
});

describe("custom theme registry", () => {
  it("registers and retrieves a custom theme", () => {
    const vars = { ...builtInThemes.github };
    registerCustomTheme("custom-1", vars);
    expect(getThemeVars("custom-1")).toBe(vars);
  });

  it("unregisters a custom theme", () => {
    registerCustomTheme("custom-2", { ...builtInThemes.blend });
    unregisterCustomTheme("custom-2");
    expect(getThemeVars("custom-2")).toBeUndefined();
  });

  it("clearCustomThemes removes all custom themes", () => {
    registerCustomTheme("a", { ...builtInThemes.blend });
    registerCustomTheme("b", { ...builtInThemes.midnight });
    clearCustomThemes();
    expect(getThemeVars("a")).toBeUndefined();
    expect(getThemeVars("b")).toBeUndefined();
  });

  it("custom themes do not shadow built-in themes in getThemeVars", () => {
    // Built-in takes priority
    expect(getThemeVars("blend")).toBe(builtInThemes.blend);
  });
});

describe("THEME_VAR_GROUPS", () => {
  it("covers all 19 CSS variables", () => {
    const allVars = THEME_VAR_GROUPS.flatMap((g) => [...g.vars]);
    const expected = Object.keys(builtInThemes.blend);
    expect(allVars.sort()).toEqual(expected.sort());
  });

  it("has 4 groups", () => {
    expect(THEME_VAR_GROUPS).toHaveLength(4);
  });
});
