import { useCallback, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import type { FileTab } from "../../stores/fileViewerStore";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  notifyDocumentOpened,
  notifyDocumentChanged,
} from "../../lib/copilot";

interface Props {
  tab: FileTab;
  repoId: string | null;
}

function bookmarkGlyphClass(color: string | null): string {
  if (!color || color === "blue") return "bookmark-glyph";
  return `bookmark-glyph bookmark-${color}`;
}

const EMPTY_BOOKMARKS: import("../../lib/tauri").FileBookmark[] = [];

export function FileViewerPanel({ tab, repoId }: Props) {
  const updateContent = useFileViewerStore((s) => s.updateContent);
  const revealLine = useFileViewerStore((s) => s.revealLine);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  const allBookmarks = useBookmarkStore((s) =>
    repoId ? s.bookmarks[repoId] ?? EMPTY_BOOKMARKS : EMPTY_BOOKMARKS,
  );
  const fileBookmarks = allBookmarks.filter((b) => b.filePath === tab.filePath);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateContent(tab.id, value);
        notifyDocumentChanged(tab.filePath, value);
      }
    },
    [tab.id, tab.filePath, updateContent],
  );

  const handleMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const content = tab.editedContent ?? tab.content ?? "";
      notifyDocumentOpened(tab.filePath, tab.language, content);

      // Gutter click handler for toggling bookmarks
      editor.onMouseDown((e) => {
        if (!repoId) return;
        const target = e.target;
        if (
          target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
          target.position
        ) {
          useBookmarkStore
            .getState()
            .toggleBookmark(repoId, tab.filePath, target.position.lineNumber);
        }
      });

      // Context menu action for adding bookmark with note
      editor.addAction({
        id: "bookmark-add-with-note",
        label: "Add Bookmark with Note...",
        contextMenuGroupId: "bookmarks",
        contextMenuOrder: 1,
        run: (ed) => {
          if (!repoId) return;
          const position = ed.getPosition();
          if (!position) return;
          const existing = useBookmarkStore
            .getState()
            .getBookmarksForFile(repoId, tab.filePath)
            .find((b) => b.lineNumber === position.lineNumber);
          useBookmarkStore.getState().setEditingBookmark({
            repoId,
            filePath: tab.filePath,
            lineNumber: position.lineNumber,
            existing,
          });
        },
      });
    },
    [tab.filePath, tab.language, tab.content, tab.editedContent, repoId],
  );

  // Apply bookmark decorations whenever bookmarks change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    // Clear previous decorations
    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }

    const decorations: Monaco.editor.IModelDeltaDecoration[] =
      fileBookmarks.map((bm) => ({
        range: new monaco.Range(bm.lineNumber, 1, bm.lineNumber, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: bookmarkGlyphClass(bm.color),
          glyphMarginHoverMessage: {
            value: bm.note || "Bookmark",
          },
        },
      }));

    decorationsRef.current = editor.createDecorationsCollection(decorations);
  }, [fileBookmarks]);

  // Apply test failure markers from test runner results
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const updateMarkers = () => {
      const state = useTestRunnerStore.getState();
      // Find the active context — try workspace first, then use repoId
      const activeWsId = useWorkspaceStore.getState().activeWorkspaceId;
      const contextId = activeWsId ?? repoId;
      if (!contextId) {
        monaco.editor.setModelMarkers(model, "test-runner", []);
        return;
      }

      const suites = state.suites[contextId] ?? [];
      const markers: Monaco.editor.IMarkerData[] = [];

      for (const suite of suites) {
        // Match suite name to current file (suite name is a relative path)
        if (!tab.filePath.endsWith(suite.name)) continue;

        for (const test of suite.tests) {
          if (test.status !== "failed" || !test.failureMessage) continue;

          // Extract line number from failure message
          const lineMatch = test.failureMessage.match(/(?:line |:)(\d+)(?::|$)/);
          const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;

          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Test failed: ${test.name}\n${test.failureMessage.slice(0, 200)}`,
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
          });
        }
      }

      monaco.editor.setModelMarkers(model, "test-runner", markers);
    };

    updateMarkers();

    const unsub = useTestRunnerStore.subscribe(updateMarkers);
    return () => {
      unsub();
      if (monacoRef.current && editor.getModel()) {
        monacoRef.current.editor.setModelMarkers(
          editor.getModel()!,
          "test-runner",
          [],
        );
      }
    };
  }, [tab.filePath, repoId]);

  // Handle revealLine from bookmarks panel
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine || revealLine.tabId !== tab.id) return;
    editor.revealLineInCenter(revealLine.line);
    editor.setPosition({ lineNumber: revealLine.line, column: 1 });
    useFileViewerStore.getState().clearRevealLine();
  }, [revealLine, tab.id]);

  // Load bookmarks for the current repo on mount
  useEffect(() => {
    if (repoId) {
      useBookmarkStore.getState().loadBookmarks(repoId);
    }
  }, [repoId]);

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
        glyphMargin: true,
        folding: true,
        wordWrap: "off",
        tabSize: 2,
        insertSpaces: true,
        quickSuggestions: true,
        suggest: { showKeywords: true, showSnippets: true },
        parameterHints: { enabled: true },
        fixedOverflowWidgets: true,
        inlineSuggest: { enabled: true },
        automaticLayout: true,
      }}
    />
  );
}
