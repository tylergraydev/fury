import Editor from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import type { FileTab } from "../../stores/fileViewerStore";

interface Props {
  tab: FileTab;
}

export function FileViewerPanel({ tab }: Props) {
  if (tab.loading) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Loading file...
      </div>
    );
  }

  if (tab.error) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--error)" }}>
        {tab.error}
      </div>
    );
  }

  return (
    <Editor
      value={tab.content ?? ""}
      language={tab.language}
      theme={MONACO_THEME}
      beforeMount={configureMonacoTheme}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        renderLineHighlight: "none",
        folding: true,
        wordWrap: "off",
      }}
    />
  );
}
