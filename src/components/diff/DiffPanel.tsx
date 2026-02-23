import { DiffEditor } from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useDiffStore } from "../../stores/diffStore";

interface Props {
  contextId: string;
}

export function DiffPanel({ contextId }: Props) {
  const selectedFile = useDiffStore(
    (s) => s.selectedFile[contextId] ?? null,
  );
  const fileDiffKey = selectedFile
    ? `${contextId}:${selectedFile}`
    : null;
  const fileDiff = useDiffStore((s) =>
    fileDiffKey ? (s.fileDiffs[fileDiffKey] ?? null) : null,
  );

  if (!selectedFile || !fileDiff) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Select a file from the Changes panel to view its diff
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center px-4 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text-primary)" }}>{selectedFile}</span>
      </div>
      <div className="flex-1">
        <DiffEditor
          original={fileDiff.original}
          modified={fileDiff.modified}
          language={fileDiff.language}
          theme={MONACO_THEME}
          beforeMount={configureMonacoTheme}
          options={{
            readOnly: true,
            renderSideBySide: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            fontSize: 12,
          }}
        />
      </div>
    </div>
  );
}
