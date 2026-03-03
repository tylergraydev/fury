import { describe, it, expect } from "vitest";
import { isGhAuthError, isGhNotFoundError, formatGhError } from "./ghErrors";

describe("isGhAuthError", () => {
  it("detects 'not authenticated' pattern", () => {
    expect(isGhAuthError("error: not authenticated with GitHub")).toBe(true);
  });

  it("detects 'gh auth login' pattern", () => {
    expect(isGhAuthError("Run gh auth login to authenticate")).toBe(true);
  });

  it("detects 'not logged into' pattern", () => {
    expect(
      isGhAuthError("You are not logged into any GitHub hosts"),
    ).toBe(true);
  });

  it("detects case-insensitive patterns", () => {
    expect(isGhAuthError("NOT AUTHENTICATED")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isGhAuthError("git push failed: rejected")).toBe(false);
  });
});

describe("isGhNotFoundError", () => {
  it("detects not found pattern", () => {
    expect(
      isGhNotFoundError(
        "GitHub CLI (gh) not found in PATH. Install it from https://cli.github.com/",
      ),
    ).toBe(true);
  });

  it("returns false for auth errors", () => {
    expect(isGhNotFoundError("not authenticated")).toBe(false);
  });
});

describe("formatGhError", () => {
  it("formats auth errors with friendly message", () => {
    const result = formatGhError("Not authenticated with github.com");
    expect(result).toContain("gh auth login");
  });

  it("formats not-found errors with install link", () => {
    const result = formatGhError(
      "GitHub CLI (gh) not found in PATH. Install it from https://cli.github.com/",
    );
    expect(result).toContain("https://cli.github.com/");
  });

  it("returns null for non-gh errors", () => {
    expect(formatGhError("some random error")).toBeNull();
  });

  it("prioritizes not-found over auth", () => {
    const result = formatGhError(
      "GitHub CLI (gh) not found in PATH",
    );
    expect(result).toContain("not installed");
  });
});
