import { describe, it, expect } from "vitest";
import { getContextWindow, DEFAULT_CONTEXT_WINDOW } from "./models";

describe("getContextWindow", () => {
  it("returns 1M for empty string (default/Opus)", () => {
    expect(getContextWindow("")).toBe(1_000_000);
  });

  it("returns 1M for 'opus'", () => {
    expect(getContextWindow("opus")).toBe(1_000_000);
  });

  it("returns 200k for 'sonnet'", () => {
    expect(getContextWindow("sonnet")).toBe(200_000);
  });

  it("returns 200k for 'haiku'", () => {
    expect(getContextWindow("haiku")).toBe(200_000);
  });

  it("returns 128k for 'o4-mini'", () => {
    expect(getContextWindow("o4-mini")).toBe(128_000);
  });

  it("returns DEFAULT_CONTEXT_WINDOW for unknown model strings", () => {
    expect(getContextWindow("unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getContextWindow("claude-99")).toBe(200_000);
  });
});
