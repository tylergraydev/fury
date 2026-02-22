import { describe, it, expect, vi } from "vitest";
import { MONACO_THEME, configureMonacoTheme } from "./monacoTheme";

describe("monacoTheme", () => {
  it("exports MONACO_THEME as 'spokane-dark'", () => {
    expect(MONACO_THEME).toBe("spokane-dark");
  });

  it("configureMonacoTheme calls defineTheme with the theme name", () => {
    const mockDefineTheme = vi.fn();
    const mockMonaco = { editor: { defineTheme: mockDefineTheme } };
    configureMonacoTheme(mockMonaco as any);
    expect(mockDefineTheme).toHaveBeenCalledWith(
      "spokane-dark",
      expect.any(Object),
    );
  });

  it("theme base is 'vs-dark'", () => {
    const mockDefineTheme = vi.fn();
    const mockMonaco = { editor: { defineTheme: mockDefineTheme } };
    configureMonacoTheme(mockMonaco as any);
    const themeData = mockDefineTheme.mock.calls[0][1];
    expect(themeData.base).toBe("vs-dark");
  });

  it("theme inherits from base", () => {
    const mockDefineTheme = vi.fn();
    const mockMonaco = { editor: { defineTheme: mockDefineTheme } };
    configureMonacoTheme(mockMonaco as any);
    const themeData = mockDefineTheme.mock.calls[0][1];
    expect(themeData.inherit).toBe(true);
  });

  it("theme has editor.background color", () => {
    const mockDefineTheme = vi.fn();
    const mockMonaco = { editor: { defineTheme: mockDefineTheme } };
    configureMonacoTheme(mockMonaco as any);
    const themeData = mockDefineTheme.mock.calls[0][1];
    expect(themeData.colors["editor.background"]).toBe("#000000");
  });

  it("theme has editor.foreground color", () => {
    const mockDefineTheme = vi.fn();
    const mockMonaco = { editor: { defineTheme: mockDefineTheme } };
    configureMonacoTheme(mockMonaco as any);
    const themeData = mockDefineTheme.mock.calls[0][1];
    expect(themeData.colors["editor.foreground"]).toBe("#f0f6fc");
  });
});
