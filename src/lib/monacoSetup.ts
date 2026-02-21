import * as monaco from "monaco-editor";
import { typescript, json } from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { loadTypeDefinitions } from "./tauri";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

// Use locally-installed monaco-editor instead of CDN
loader.config({ monaco });

// Configure web workers for language services
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "typescript" || label === "javascript") return new tsWorker();
    if (label === "css" || label === "scss" || label === "less")
      return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor")
      return new htmlWorker();
    if (label === "json") return new jsonWorker();
    return new editorWorker();
  },
};

// TypeScript/JavaScript compiler defaults
const tsCompilerOptions: typescript.CompilerOptions = {
  target: typescript.ScriptTarget.ESNext,
  module: typescript.ModuleKind.ESNext,
  moduleResolution: typescript.ModuleResolutionKind.NodeJs,
  jsx: typescript.JsxEmit.ReactJSX,
  allowJs: true,
  strict: true,
  esModuleInterop: true,
  allowNonTsExtensions: true,
  noResolve: true,
  noEmit: true,
};

typescript.typescriptDefaults.setCompilerOptions(tsCompilerOptions);
typescript.javascriptDefaults.setCompilerOptions(tsCompilerOptions);

// Suppress diagnostics that are unavoidable in a single-file editor context.
// Module resolution errors persist even with type definitions loaded because
// Monaco cannot resolve relative project imports (./components/Foo, etc.).
const tsDiagnosticsOptions: typescript.DiagnosticsOptions = {
  noSemanticValidation: false,
  noSyntaxValidation: false,
  diagnosticCodesToIgnore: [
    2307, // Cannot find module '{0}' or its corresponding type declarations.
    2304, // Cannot find name '{0}'.
    7016, // Could not find a declaration file for module '{0}'.
  ],
};

typescript.typescriptDefaults.setDiagnosticsOptions(tsDiagnosticsOptions);
typescript.javascriptDefaults.setDiagnosticsOptions(tsDiagnosticsOptions);

// JSON validation defaults
json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: true,
  trailingCommas: "ignore",
});

// --- Type definition loading ---

const loadedContexts = new Set<string>();

export async function ensureTypesLoaded(
  contextId: string,
  contextType: "workspace" | "repo",
): Promise<void> {
  const key = `${contextType}:${contextId}`;
  if (loadedContexts.has(key)) return;
  loadedContexts.add(key);

  try {
    const defs = await loadTypeDefinitions(contextId, contextType);

    for (const lib of defs.libs) {
      const uri = `file:///${lib.filePath}`;
      typescript.typescriptDefaults.addExtraLib(lib.content, uri);
      typescript.javascriptDefaults.addExtraLib(lib.content, uri);
    }
  } catch {
    // Type loading is best-effort; don't block the editor
    loadedContexts.delete(key);
  }
}
