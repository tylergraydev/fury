import type { Monaco } from "@monaco-editor/react";

export const MONACO_THEME = "spokane-dark";

export function configureMonacoTheme(monaco: Monaco) {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [{ token: "", foreground: "ffffff", background: "000000" }],
    colors: {
      "editor.background": "#000000",
      "editor.foreground": "#ffffff",
      "editor.lineHighlightBackground": "#0a0a0a",
      "editorLineNumber.foreground": "#666666",
      "editorLineNumber.activeForeground": "#b0b0b0",
      "editor.selectionBackground": "#252525",
      "editor.inactiveSelectionBackground": "#1a1a1a",
      "editorCursor.foreground": "#ffffff",
      "editorWhitespace.foreground": "#262626",
      "editorIndentGuide.background": "#262626",
      "editorIndentGuide.activeBackground": "#666666",
      "editorWidget.background": "#0a0a0a",
      "editorWidget.border": "#262626",
      "editorGutter.background": "#000000",
      "scrollbar.shadow": "#000000",
      "scrollbarSlider.background": "#25252580",
      "scrollbarSlider.hoverBackground": "#66666680",
      "scrollbarSlider.activeBackground": "#b0b0b080",
      "diffEditor.insertedTextBackground": "#4ade8020",
      "diffEditor.removedTextBackground": "#f8717120",
      "editorOverviewRuler.border": "#262626",
      "panel.border": "#262626",
    },
  });
}
