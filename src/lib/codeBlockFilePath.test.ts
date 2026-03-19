import { describe, it, expect } from "vitest";
import { createElement } from "react";
import {
  detectFilePath,
  looksLikeFilePath,
  extractCodeBlockInfo,
} from "./codeBlockFilePath";

describe("looksLikeFilePath", () => {
  it("returns true for paths with extension and slash", () => {
    expect(looksLikeFilePath("src/app.ts")).toBe(true);
    expect(looksLikeFilePath("src/components/App.tsx")).toBe(true);
    expect(looksLikeFilePath("package.json")).toBe(true);
  });

  it("returns true for paths with @ and hyphens", () => {
    expect(looksLikeFilePath("@types/node.d.ts")).toBe(true);
    expect(looksLikeFilePath("my-component.tsx")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(looksLikeFilePath("")).toBe(false);
  });

  it("returns false for strings without extension", () => {
    expect(looksLikeFilePath("src/app")).toBe(false);
    expect(looksLikeFilePath("README")).toBe(false);
  });

  it("returns false for strings with spaces or special chars", () => {
    expect(looksLikeFilePath("my file.ts")).toBe(false);
    expect(looksLikeFilePath('src/"app".ts')).toBe(false);
    expect(looksLikeFilePath("src/<App>.tsx")).toBe(false);
  });

  it("returns false for very long strings", () => {
    expect(looksLikeFilePath("a".repeat(201) + ".ts")).toBe(false);
  });
});

describe("detectFilePath", () => {
  describe("Tier 1: colon-delimited className", () => {
    it("extracts path from language-typescript:path", () => {
      const result = detectFilePath(
        "language-typescript:src/app.ts",
        "const x = 1;",
        "",
      );
      expect(result).toBe("src/app.ts");
    });

    it("extracts path from language-python:path", () => {
      const result = detectFilePath(
        "language-python:src/main.py",
        "print('hello')",
        "",
      );
      expect(result).toBe("src/main.py");
    });

    it("returns null for className without colon", () => {
      const result = detectFilePath(
        "language-typescript",
        "const x = 1;",
        "",
      );
      expect(result).toBeNull();
    });

    it("returns null when colon value is not a file path", () => {
      const result = detectFilePath(
        "language-typescript:not a path",
        "const x = 1;",
        "",
      );
      expect(result).toBeNull();
    });
  });

  describe("Tier 2: first line comment", () => {
    it("extracts path from // comment", () => {
      const result = detectFilePath(
        undefined,
        "// src/utils/helpers.ts\nexport function foo() {}",
        "",
      );
      expect(result).toBe("src/utils/helpers.ts");
    });

    it("extracts path from # comment", () => {
      const result = detectFilePath(
        undefined,
        "# config/settings.py\nDEBUG = True",
        "",
      );
      expect(result).toBe("config/settings.py");
    });

    it("extracts path from /* */ comment", () => {
      const result = detectFilePath(
        undefined,
        "/* src/styles.css */\nbody { }",
        "",
      );
      expect(result).toBe("src/styles.css");
    });

    it("does not match non-path comments", () => {
      const result = detectFilePath(
        undefined,
        "// This is a regular comment",
        "",
      );
      expect(result).toBeNull();
    });
  });

  describe("Tier 3: preceding markdown backtick paths", () => {
    it("extracts path from backtick-quoted path in preceding text", () => {
      const markdown =
        "Here is the updated `src/components/App.tsx`:\n```typescript\nconst App = () => {};\n```";
      const result = detectFilePath(
        "language-typescript",
        "const App = () => {};",
        markdown,
      );
      expect(result).toBe("src/components/App.tsx");
    });

    it("picks the last backtick-quoted path", () => {
      const markdown =
        "I modified `src/old.ts` and `src/new.ts`:\n```\ncode here\n```";
      const result = detectFilePath(undefined, "code here", markdown);
      expect(result).toBe("src/new.ts");
    });

    it("returns null when preceding text has no file paths", () => {
      const markdown =
        "Here is some code with `variable` names:\n```\ncode here\n```";
      const result = detectFilePath(undefined, "code here", markdown);
      expect(result).toBeNull();
    });

    it("returns null when code text not found in markdown", () => {
      const result = detectFilePath(undefined, "missing code", "no match");
      expect(result).toBeNull();
    });
  });

  describe("priority order", () => {
    it("prefers Tier 1 over Tier 2", () => {
      const result = detectFilePath(
        "language-ts:src/from-classname.ts",
        "// src/from-comment.ts\ncode",
        "",
      );
      expect(result).toBe("src/from-classname.ts");
    });

    it("prefers Tier 2 over Tier 3", () => {
      const markdown =
        "See `src/from-markdown.ts`:\n```\n// src/from-comment.ts\ncode\n```";
      const result = detectFilePath(
        undefined,
        "// src/from-comment.ts\ncode",
        markdown,
      );
      expect(result).toBe("src/from-comment.ts");
    });
  });

  it("returns null with no className and empty code", () => {
    expect(detectFilePath(undefined, "", "")).toBeNull();
  });
});

describe("extractCodeBlockInfo", () => {
  it("extracts info from a code element with className", () => {
    const codeEl = createElement(
      "code",
      { className: "language-typescript:src/app.ts" },
      "const x = 1;",
    );
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("const x = 1;");
    expect(result.language).toBe("typescript");
    expect(result.filePath).toBe("src/app.ts");
  });

  it("extracts language without file path", () => {
    const codeEl = createElement(
      "code",
      { className: "language-python" },
      "print('hello')",
    );
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("print('hello')");
    expect(result.language).toBe("python");
    expect(result.filePath).toBeNull();
  });

  it("handles code element without className", () => {
    const codeEl = createElement("code", {}, "plain code");
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("plain code");
    expect(result.language).toBe("");
    expect(result.filePath).toBeNull();
  });

  it("returns defaults for non-element children", () => {
    const result = extractCodeBlockInfo("plain string", "");
    expect(result).toEqual({
      codeText: "",
      language: "",
      filePath: null,
    });
  });

  it("returns defaults for null children", () => {
    const result = extractCodeBlockInfo(null, "");
    expect(result).toEqual({
      codeText: "",
      language: "",
      filePath: null,
    });
  });

  it("handles nested children in code element", () => {
    const nested = createElement("span", {}, "inner");
    const codeEl = createElement(
      "code",
      { className: "language-js" },
      "outer ",
      nested,
    );
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("outer inner");
    expect(result.language).toBe("js");
  });

  it("handles numeric children", () => {
    const codeEl = createElement("code", { className: "language-js" }, 42);
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("42");
  });

  it("handles array of children at top level", () => {
    const codeEl = createElement(
      "code",
      { className: "language-ts" },
      "line1",
    );
    const divEl = createElement("div", {}, "other");
    const result = extractCodeBlockInfo([codeEl, divEl], "");
    expect(result.codeText).toBe("line1");
    expect(result.language).toBe("ts");
  });

  it("skips non-code elements in children array", () => {
    const divEl = createElement("div", {}, "not code");
    const result = extractCodeBlockInfo(divEl, "");
    expect(result).toEqual({
      codeText: "",
      language: "",
      filePath: null,
    });
  });

  it("handles boolean children in code element gracefully", () => {
    const codeEl = createElement("code", { className: "language-ts" }, true as unknown as string);
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("");
  });

  it("handles null children in code element", () => {
    const codeEl = createElement("code", { className: "language-ts" }, null);
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.codeText).toBe("");
  });

  it("handles empty code text for file path detection", () => {
    const codeEl = createElement("code", { className: "language-ts" }, "");
    const result = extractCodeBlockInfo(codeEl, "");
    expect(result.filePath).toBeNull();
  });
});
