import { useCallback } from "react";
import Editor from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import type { FileTab } from "../../stores/fileViewerStore";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import {
  notifyDocumentOpened,
  notifyDocumentChanged,
} from "../../lib/copilot";

interface Props {
  tab: FileTab;
}

export function FileViewerPanel({ tab }: Props) {
  const updateContent = useFileViewerStore((s) => s.updateContent);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateContent(tab.id, value);
        notifyDocumentChanged(tab.filePath, value);
      }
    },
    [tab.id, tab.filePath, updateContent],
  );

  const handleMount = useCallback(() => {
    const content = tab.editedContent ?? tab.content ?? "";
    notifyDocumentOpened(tab.filePath, tab.language, content);
  }, [tab.filePath, tab.language, tab.content, tab.editedContent]);

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
      path={tab.filePath}
      value={tab.editedContent ?? tab.content ?? ""}
      language={tab.language}
      theme={MONACO_THEME}
      beforeMount={configureMonacoTheme}
      onMount={handleMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        renderLineHighlight: "line",
        folding: true,
        wordWrap: "off",
        tabSize: 2,
        insertSpaces: true,
        quickSuggestions: true,
        suggest: { showKeywords: true, showSnippets: true },
        parameterHints: { enabled: true },
        fixedOverflowWidgets: true,
        inlineSuggest: { enabled: true },
      }}
    />
  );
}
