import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSetCompilerOptions,
  mockSetDiagnosticsOptions,
  mockAddExtraLib,
  mockJsonSetDiagnosticsOptions,
} = vi.hoisted(() => ({
  mockSetCompilerOptions: vi.fn(),
  mockSetDiagnosticsOptions: vi.fn(),
  mockAddExtraLib: vi.fn(),
  mockJsonSetDiagnosticsOptions: vi.fn(),
}));

vi.mock("monaco-editor", () => ({
  typescript: {
    ScriptTarget: { ESNext: 99 },
    ModuleKind: { ESNext: 99 },
    ModuleResolutionKind: { NodeJs: 2 },
    JsxEmit: { ReactJSX: 4 },
    typescriptDefaults: {
      setCompilerOptions: mockSetCompilerOptions,
      setDiagnosticsOptions: mockSetDiagnosticsOptions,
      addExtraLib: mockAddExtraLib,
    },
    javascriptDefaults: {
      setCompilerOptions: mockSetCompilerOptions,
      setDiagnosticsOptions: mockSetDiagnosticsOptions,
      addExtraLib: mockAddExtraLib,
    },
  },
  json: {
    jsonDefaults: {
      setDiagnosticsOptions: mockJsonSetDiagnosticsOptions,
    },
  },
}));

vi.mock("@monaco-editor/react", () => ({
  loader: { config: vi.fn() },
}));

// Mock all worker imports
vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => ({
  default: vi.fn(),
}));
vi.mock("monaco-editor/esm/vs/language/typescript/ts.worker?worker", () => ({
  default: vi.fn(),
}));
vi.mock("monaco-editor/esm/vs/language/css/css.worker?worker", () => ({
  default: vi.fn(),
}));
vi.mock("monaco-editor/esm/vs/language/html/html.worker?worker", () => ({
  default: vi.fn(),
}));
vi.mock("monaco-editor/esm/vs/language/json/json.worker?worker", () => ({
  default: vi.fn(),
}));

vi.mock("./tauri", () => ({
  loadTypeDefinitions: vi.fn().mockResolvedValue({ libs: [] }),
}));

import { ensureTypesLoaded } from "./monacoSetup";
import { loadTypeDefinitions } from "./tauri";

describe("monacoSetup – MonacoEnvironment getWorker", () => {
  it("returns ts worker for typescript label", () => {
    const env = (globalThis as any).MonacoEnvironment;
    expect(env).toBeDefined();
    // The getWorker function should exist
    expect(typeof env.getWorker).toBe("function");
  });

  it("returns workers for different labels", () => {
    const env = (globalThis as any).MonacoEnvironment;
    // These return mocked worker constructors (vi.fn())
    // Just verify they don't throw
    expect(() => env.getWorker("_", "typescript")).not.toThrow();
    expect(() => env.getWorker("_", "javascript")).not.toThrow();
    expect(() => env.getWorker("_", "css")).not.toThrow();
    expect(() => env.getWorker("_", "scss")).not.toThrow();
    expect(() => env.getWorker("_", "less")).not.toThrow();
    expect(() => env.getWorker("_", "html")).not.toThrow();
    expect(() => env.getWorker("_", "handlebars")).not.toThrow();
    expect(() => env.getWorker("_", "razor")).not.toThrow();
    expect(() => env.getWorker("_", "json")).not.toThrow();
    // Default fallback
    expect(() => env.getWorker("_", "unknown")).not.toThrow();
  });
});

describe("monacoSetup – side effects on import", () => {
  it("sets TypeScript and JavaScript compiler options on import", () => {
    // setCompilerOptions is called twice: once for typescriptDefaults, once for javascriptDefaults
    expect(mockSetCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 99,
        module: 99,
        moduleResolution: 2,
        jsx: 4,
        allowJs: true,
        strict: true,
        esModuleInterop: true,
        allowNonTsExtensions: true,
        noResolve: true,
        noEmit: true,
      }),
    );
    expect(mockSetCompilerOptions).toHaveBeenCalledTimes(2);
  });

  it("sets diagnostic options with ignored codes on import", () => {
    expect(mockSetDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticCodesToIgnore: [2307, 2304, 7016],
      }),
    );
    // Called for both typescriptDefaults and javascriptDefaults
    expect(mockSetDiagnosticsOptions).toHaveBeenCalledTimes(2);
  });

  it("sets JSON diagnostics options on import", () => {
    expect(mockJsonSetDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        validate: true,
        allowComments: true,
        trailingCommas: "ignore",
      }),
    );
    expect(mockJsonSetDiagnosticsOptions).toHaveBeenCalledTimes(1);
  });
});

describe("ensureTypesLoaded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls loadTypeDefinitions with contextId and contextType", async () => {
    await ensureTypesLoaded("ws-load-1", "workspace");
    expect(loadTypeDefinitions).toHaveBeenCalledWith("ws-load-1", "workspace");
  });

  it("skips loading if already loaded for the same context", async () => {
    // Use a unique contextId for this test
    (loadTypeDefinitions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ libs: [] });
    await ensureTypesLoaded("ws-skip-1", "repo");
    expect(loadTypeDefinitions).toHaveBeenCalledTimes(1);

    // Second call with same args should be skipped
    await ensureTypesLoaded("ws-skip-1", "repo");
    expect(loadTypeDefinitions).toHaveBeenCalledTimes(1);
  });

  it("adds extra libs to TS and JS defaults when libs are returned", async () => {
    (loadTypeDefinitions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      libs: [
        {
          filePath: "node_modules/@types/react/index.d.ts",
          content: "declare module 'react' {}",
        },
      ],
    });

    await ensureTypesLoaded("ws-libs-1", "workspace");

    // addExtraLib is called twice per lib: once for typescriptDefaults, once for javascriptDefaults
    expect(mockAddExtraLib).toHaveBeenCalledWith(
      "declare module 'react' {}",
      "file:///node_modules/@types/react/index.d.ts",
    );
    expect(mockAddExtraLib).toHaveBeenCalledTimes(2);
  });

  it("handles errors gracefully and allows retry", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    (loadTypeDefinitions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network error"),
    );

    // First call fails
    await ensureTypesLoaded("ws-err-1", "workspace");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[monaco] Failed to load type definitions:",
      expect.any(Error),
    );

    // Because the error handler removes the key from loadedContexts, a retry should call loadTypeDefinitions again
    (loadTypeDefinitions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ libs: [] });
    await ensureTypesLoaded("ws-err-1", "workspace");
    expect(loadTypeDefinitions).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });
});
