import type { Monaco } from "@monaco-editor/react";

export const MONACO_THEME = "spokane-dark";

export function configureMonacoTheme(monaco: Monaco) {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [{ token: "", foreground: "f0f6fc", background: "000000" }],
    colors: {
      "editor.background": "#000000",
      "editor.foreground": "#f0f6fc",
      "editor.lineHighlightBackground": "#0d1117",
      "editorLineNumber.foreground": "#6e7681",
      "editorLineNumber.activeForeground": "#b0b0b0",
      "editor.selectionBackground": "#1c2128",
      "editor.inactiveSelectionBackground": "#161b22",
      "editorCursor.foreground": "#f0f6fc",
      "editorWhitespace.foreground": "#30363d",
      "editorIndentGuide.background": "#30363d",
      "editorIndentGuide.activeBackground": "#6e7681",
      "editorWidget.background": "#0d1117",
      "editorWidget.border": "#30363d",
      "editorGutter.background": "#000000",
      "scrollbar.shadow": "#000000",
      "scrollbarSlider.background": "#30363d80",
      "scrollbarSlider.hoverBackground": "#6e768180",
      "scrollbarSlider.activeBackground": "#b0b0b080",
      "diffEditor.insertedTextBackground": "#4ade8020",
      "diffEditor.removedTextBackground": "#f8717120",
      "editorOverviewRuler.border": "#30363d",
      "panel.border": "#30363d",
    },
  });
}
