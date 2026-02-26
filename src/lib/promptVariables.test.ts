import { describe, it, expect } from "vitest";
import {
  extractVariables,
  substituteVariables,
  isAutoFillVariable,
} from "./promptVariables";

describe("extractVariables", () => {
  it("extracts unique variable names", () => {
    const vars = extractVariables(
      "Review {{file}} for {{issue_type}} in {{file}}",
    );
    expect(vars).toEqual(["file", "issue_type"]);
  });

  it("returns empty array when no variables", () => {
    expect(extractVariables("No variables here")).toEqual([]);
  });

  it("handles adjacent variables", () => {
    expect(extractVariables("{{a}}{{b}}")).toEqual(["a", "b"]);
  });
});

describe("substituteVariables", () => {
  it("replaces known variables", () => {
    const result = substituteVariables("Hello {{name}}, check {{file}}", {
      name: "World",
      file: "main.ts",
    });
    expect(result).toBe("Hello World, check main.ts");
  });

  it("leaves unknown variables untouched", () => {
    const result = substituteVariables("{{known}} and {{unknown}}", {
      known: "yes",
    });
    expect(result).toBe("yes and {{unknown}}");
  });

  it("returns content unchanged when no variables match", () => {
    expect(substituteVariables("plain text", {})).toBe("plain text");
  });
});

describe("isAutoFillVariable", () => {
  it("returns true for known auto-fill variables", () => {
    expect(isAutoFillVariable("file")).toBe(true);
    expect(isAutoFillVariable("selection")).toBe(true);
    expect(isAutoFillVariable("branch")).toBe(true);
    expect(isAutoFillVariable("workspace")).toBe(true);
  });

  it("returns false for unknown variables", () => {
    expect(isAutoFillVariable("custom")).toBe(false);
    expect(isAutoFillVariable("issue_type")).toBe(false);
  });
});
