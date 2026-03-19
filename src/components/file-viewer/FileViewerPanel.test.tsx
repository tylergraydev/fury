import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn(),
}));

const mockOnChange = vi.fn();
let mockOnMount: ((editor: any, monaco: any) => void) | null = null;
let autoMount = true;
const mockClear = vi.fn();
const mockModel = {
  getLineMaxColumn: vi.fn((_line: number) => 80),
};
const mockEditor = {
  onMouseDown: vi.fn(),
  addAction: vi.fn(),
  revealLineInCenter: vi.fn(),
  setPosition: vi.fn(),
  createDecorationsCollection: vi.fn((..._args: any[]) => ({ clear: mockClear })),
  getModel: vi.fn((): any => mockModel),
};
const mockMonaco = {
  editor: {
    MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
    setModelMarkers: vi.fn(),
  },
  Range: vi.fn(),
  MarkerSeverity: { Error: 8 },
};
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, language, onChange, onMount, beforeMount: _beforeMount }: any) => {
    mockOnChange.mockImplementation(onChange);
    mockOnMount = onMount;
    // Auto-mount synchronously so refs are set before useEffect runs
    if (autoMount && onMount) {
      onMount(mockEditor, mockMonaco);
    }
    return <div data-testid="monaco-editor" data-language={language} data-value={value} />;
  },
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "test-theme",
  configureMonacoTheme: vi.fn(),
}));

vi.mock("../../lib/copilot", () => ({
  notifyDocumentOpened: vi.fn(),
  notifyDocumentChanged: vi.fn(),
}));

import { FileViewerPanel } from "./FileViewerPanel";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { FileTab } from "../../stores/fileViewerStore";

beforeEach(() => {
  useFileViewerStore.setState({ tabs: [], activeTabId: null, revealLine: null });
  useBookmarkStore.setState({
    bookmarks: {},
    loading: {},
    error: {},
    editingBookmark: null,
  });
  useWorkspaceStore.setState({ activeWorkspaceId: null });
  useTestRunnerStore.setState({ suites: {} });
  vi.clearAllMocks();
  mockOnMount = null;
  autoMount = true;
  mockEditor.getModel.mockReturnValue(mockModel);
});

const baseTab: FileTab = {
  id: "tab-1",
  filePath: "/src/test.ts",
  language: "typescript",
  content: "const x = 1;",
  editedContent: null,
  dirty: false,
  pinned: false,
  loading: false,
  saving: false,
  error: null,
  contextId: "ws-1",
  contextType: "workspace" as const,
};

/** Helper to trigger onMount manually (when autoMount is disabled) */
function triggerMount(editor = mockEditor, monaco = mockMonaco) {
  expect(mockOnMount).not.toBeNull();
  act(() => {
    mockOnMount!(editor, monaco);
  });
}

describe("FileViewerPanel", () => {
  // --- Rendering states ---

  it("shows 'Loading file...' when tab.loading is true", () => {
    render(<FileViewerPanel tab={{ ...baseTab, loading: true }} repoId={null} />);
    expect(screen.getByText("Loading file...")).toBeInTheDocument();
  });

  it("shows error message when tab.error is set", () => {
    render(<FileViewerPanel tab={{ ...baseTab, error: "File not found" }} repoId={null} />);
    expect(screen.getByText("File not found")).toBeInTheDocument();
  });

  it("renders Monaco Editor when content is available", () => {
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
  });

  it("editor value uses editedContent when available", () => {
    render(
      <FileViewerPanel
        tab={{ ...baseTab, editedContent: "const y = 2;" }}
        repoId={null}
      />,
    );
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe("const y = 2;");
  });

  it("editor value falls back to content when no editedContent", () => {
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe("const x = 1;");
  });

  it("editor uses tab.language for syntax highlighting", () => {
    render(
      <FileViewerPanel tab={{ ...baseTab, language: "python" }} repoId={null} />,
    );
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-language")).toBe("python");
  });

  it("editor value falls back to empty string when both content and editedContent are null", () => {
    render(
      <FileViewerPanel tab={{ ...baseTab, content: null, editedContent: null }} repoId={null} />,
    );
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe("");
  });

  // --- handleChange ---

  it("handleChange updates content and notifies copilot when value is defined", async () => {
    const { notifyDocumentChanged } = await import("../../lib/copilot");
    const updateContent = vi.fn();
    useFileViewerStore.setState({ updateContent });
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    mockOnChange("updated content");
    expect(updateContent).toHaveBeenCalledWith("tab-1", "updated content");
    expect(notifyDocumentChanged).toHaveBeenCalledWith("/src/test.ts", "updated content");
  });

  it("handleChange does nothing when value is undefined", () => {
    const updateContent = vi.fn();
    useFileViewerStore.setState({ updateContent });
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    mockOnChange(undefined);
    expect(updateContent).not.toHaveBeenCalled();
  });

  // --- handleMount ---

  it("handleMount notifies copilot with document opened", async () => {
    const { notifyDocumentOpened } = await import("../../lib/copilot");
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();
    expect(notifyDocumentOpened).toHaveBeenCalledWith("/src/test.ts", "typescript", "const x = 1;");
  });

  it("handleMount uses editedContent when available", async () => {
    const { notifyDocumentOpened } = await import("../../lib/copilot");
    render(
      <FileViewerPanel tab={{ ...baseTab, editedContent: "edited" }} repoId={null} />,
    );
    triggerMount();
    expect(notifyDocumentOpened).toHaveBeenCalledWith("/src/test.ts", "typescript", "edited");
  });

  it("handleMount falls back to empty string when both content and editedContent are null", async () => {
    const { notifyDocumentOpened } = await import("../../lib/copilot");
    render(
      <FileViewerPanel tab={{ ...baseTab, content: null, editedContent: null }} repoId={null} />,
    );
    triggerMount();
    expect(notifyDocumentOpened).toHaveBeenCalledWith("/src/test.ts", "typescript", "");
  });

  // --- onMouseDown (gutter click for bookmark toggling) ---

  it("onMouseDown toggles bookmark when clicking gutter glyph margin with repoId", () => {
    const toggleBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      toggleBookmark,
    } as any);
    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const mouseHandler = mockEditor.onMouseDown.mock.calls[0][0];
    mouseHandler({
      target: {
        type: 2, // GUTTER_GLYPH_MARGIN
        position: { lineNumber: 5 },
      },
    });

    expect(toggleBookmark).toHaveBeenCalledWith("repo-1", "/src/test.ts", 5);
  });

  it("onMouseDown does nothing when repoId is null", () => {
    const toggleBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      toggleBookmark,
    } as any);
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();

    const mouseHandler = mockEditor.onMouseDown.mock.calls[0][0];
    mouseHandler({
      target: {
        type: 2,
        position: { lineNumber: 5 },
      },
    });

    expect(toggleBookmark).not.toHaveBeenCalled();
  });

  it("onMouseDown does nothing when target type is not GUTTER_GLYPH_MARGIN", () => {
    const toggleBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      toggleBookmark,
    } as any);
    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const mouseHandler = mockEditor.onMouseDown.mock.calls[0][0];
    mouseHandler({
      target: {
        type: 999, // Not GUTTER_GLYPH_MARGIN
        position: { lineNumber: 5 },
      },
    });

    expect(toggleBookmark).not.toHaveBeenCalled();
  });

  it("onMouseDown does nothing when target.position is null", () => {
    const toggleBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      toggleBookmark,
    } as any);
    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const mouseHandler = mockEditor.onMouseDown.mock.calls[0][0];
    mouseHandler({
      target: {
        type: 2,
        position: null,
      },
    });

    expect(toggleBookmark).not.toHaveBeenCalled();
  });

  // --- addAction (bookmark with note) ---

  it("addAction run handler sets editing bookmark when repoId and position exist", () => {
    const setEditingBookmark = vi.fn();
    const getBookmarksForFile = vi.fn().mockReturnValue([]);
    useBookmarkStore.setState({
      bookmarks: {},
      setEditingBookmark,
      getBookmarksForFile,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const addActionCall = mockEditor.addAction.mock.calls[0][0];
    expect(addActionCall.id).toBe("bookmark-add-with-note");
    expect(addActionCall.label).toBe("Add Bookmark with Note...");

    // Simulate the run callback with a mock editor that has getPosition
    const mockEd = { getPosition: vi.fn().mockReturnValue({ lineNumber: 10 }) };
    addActionCall.run(mockEd);

    expect(getBookmarksForFile).toHaveBeenCalledWith("repo-1", "/src/test.ts");
    expect(setEditingBookmark).toHaveBeenCalledWith({
      repoId: "repo-1",
      filePath: "/src/test.ts",
      lineNumber: 10,
      existing: undefined,
    });
  });

  it("addAction run handler does nothing when repoId is null", () => {
    const setEditingBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      setEditingBookmark,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();

    const addActionCall = mockEditor.addAction.mock.calls[0][0];
    const mockEd = { getPosition: vi.fn().mockReturnValue({ lineNumber: 10 }) };
    addActionCall.run(mockEd);

    expect(setEditingBookmark).not.toHaveBeenCalled();
  });

  it("addAction run handler does nothing when position is null", () => {
    const setEditingBookmark = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      setEditingBookmark,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const addActionCall = mockEditor.addAction.mock.calls[0][0];
    const mockEd = { getPosition: vi.fn().mockReturnValue(null) };
    addActionCall.run(mockEd);

    expect(setEditingBookmark).not.toHaveBeenCalled();
  });

  it("addAction run handler passes existing bookmark when found", () => {
    const existingBookmark = {
      id: "bm-1",
      repoId: "repo-1",
      filePath: "/src/test.ts",
      lineNumber: 10,
      note: "existing note",
      color: "blue",
      createdAt: "2024-01-01",
    };
    const setEditingBookmark = vi.fn();
    const getBookmarksForFile = vi.fn().mockReturnValue([existingBookmark]);
    useBookmarkStore.setState({
      bookmarks: {},
      setEditingBookmark,
      getBookmarksForFile,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const addActionCall = mockEditor.addAction.mock.calls[0][0];
    const mockEd = { getPosition: vi.fn().mockReturnValue({ lineNumber: 10 }) };
    addActionCall.run(mockEd);

    expect(setEditingBookmark).toHaveBeenCalledWith({
      repoId: "repo-1",
      filePath: "/src/test.ts",
      lineNumber: 10,
      existing: existingBookmark,
    });
  });

  // --- Bookmark decorations useEffect ---

  it("applies bookmark decorations when bookmarks exist", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "Test note", color: "red", createdAt: "2024-01-01" },
          { id: "bm-2", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 10, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    // After mount, the useEffect for decorations should fire
    expect(mockEditor.createDecorationsCollection).toHaveBeenCalled();
    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations).toHaveLength(2);
  });

  it("clears previous decorations before applying new ones", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    // First render creates decorations
    expect(mockEditor.createDecorationsCollection).toHaveBeenCalledTimes(1);

    // Update bookmarks to trigger re-render
    act(() => {
      useBookmarkStore.setState({
        bookmarks: {
          "repo-1": [
            { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
            { id: "bm-2", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 8, note: "", color: null, createdAt: "2024-01-01" },
          ],
        },
      } as any);
    });

    // Should have cleared previous decorations
    expect(mockClear).toHaveBeenCalled();
  });

  it("filters bookmarks to only those matching current file path", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
          { id: "bm-2", repoId: "repo-1", filePath: "/src/other.ts", lineNumber: 10, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations).toHaveLength(1);
  });

  it("uses empty bookmarks array when repoId is null", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations).toHaveLength(0);
  });

  // --- bookmarkGlyphClass ---

  it("bookmark decoration uses default glyph class for blue color", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: "blue", createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations[0].options.glyphMarginClassName).toBe("bookmark-glyph");
  });

  it("bookmark decoration uses default glyph class for null color", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations[0].options.glyphMarginClassName).toBe("bookmark-glyph");
  });

  it("bookmark decoration uses color-specific glyph class for non-blue color", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: "red", createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations[0].options.glyphMarginClassName).toBe("bookmark-glyph bookmark-red");
  });

  it("bookmark decoration uses note as hover message when present", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "My note", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations[0].options.glyphMarginHoverMessage.value).toBe("My note");
  });

  it("bookmark decoration uses 'Bookmark' as hover message when note is empty", () => {
    useBookmarkStore.setState({
      bookmarks: {
        "repo-1": [
          { id: "bm-1", repoId: "repo-1", filePath: "/src/test.ts", lineNumber: 5, note: "", color: null, createdAt: "2024-01-01" },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations[0].options.glyphMarginHoverMessage.value).toBe("Bookmark");
  });

  // --- Test runner markers useEffect ---

  it("sets test failure markers for matching suites with failed tests", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "should work", status: "failed", failureMessage: "Expected true at line 5:10", duration: 100 },
              { name: "should pass", status: "passed", failureMessage: null, duration: 50 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalled();
    // Find the call that sets actual markers (not the empty array cleanup)
    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].severity).toBe(8); // MarkerSeverity.Error
    expect(markerCall![2][0].startLineNumber).toBe(5);
  });

  it("sets markers with line 1 when failure message has no line number", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "should work", status: "failed", failureMessage: "Something went wrong", duration: 100 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].startLineNumber).toBe(1);
  });

  it("clears markers when no contextId is available", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });

    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      expect.anything(),
      "test-runner",
      [],
    );
  });

  it("uses repoId as fallback when no active workspace", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    useTestRunnerStore.setState({
      suites: {
        "repo-1": [
          {
            name: "test.ts",
            tests: [
              { name: "test1", status: "failed", failureMessage: "error at :3:", duration: 10 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].startLineNumber).toBe(3);
  });

  it("skips suites that do not match current file path", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "other-file.ts",
            tests: [
              { name: "test1", status: "failed", failureMessage: "error", duration: 10 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    // All calls should set empty markers since no suite matches
    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    calls.forEach((c: any) => {
      expect(c[2]).toEqual([]);
    });
  });

  it("skips tests that are not failed", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "passing test", status: "passed", failureMessage: null, duration: 50 },
              { name: "skipped test", status: "skipped", failureMessage: null, duration: 0 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    calls.forEach((c: any) => {
      expect(c[2]).toEqual([]);
    });
  });

  it("subscribes to test runner store and cleans up on unmount", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({ suites: {} });

    const { unmount } = render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    // Unmount should clean up markers
    unmount();

    // The cleanup should have called setModelMarkers with empty array
    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall![2]).toEqual([]);
  });

  it("updates markers when test runner store changes", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({ suites: {} });

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    // Clear mock calls from initial render
    mockMonaco.editor.setModelMarkers.mockClear();

    // Simulate test runner store updating
    act(() => {
      useTestRunnerStore.setState({
        suites: {
          "ws-1": [
            {
              name: "test.ts",
              tests: [
                { name: "fail", status: "failed", failureMessage: "err line 7:", duration: 10 },
              ],
            },
          ],
        },
      } as any);
    });

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].startLineNumber).toBe(7);
  });

  it("handles empty suites array for contextId", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [],
      },
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    // Should set empty markers
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      expect.anything(),
      "test-runner",
      [],
    );
  });

  // --- revealLine useEffect ---

  it("reveals line in editor when revealLine matches tab", () => {
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();

    const clearRevealLine = vi.fn();
    act(() => {
      useFileViewerStore.setState({
        revealLine: { tabId: "tab-1", line: 42 },
        clearRevealLine,
      } as any);
    });

    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(42);
    expect(mockEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 42, column: 1 });
  });

  it("does not reveal line when revealLine is for a different tab", () => {
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();
    mockEditor.revealLineInCenter.mockClear();
    mockEditor.setPosition.mockClear();

    act(() => {
      useFileViewerStore.setState({
        revealLine: { tabId: "other-tab", line: 42 },
      } as any);
    });

    expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();
    expect(mockEditor.setPosition).not.toHaveBeenCalled();
  });

  it("does not reveal line when revealLine is null", () => {
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    triggerMount();
    mockEditor.revealLineInCenter.mockClear();

    act(() => {
      useFileViewerStore.setState({ revealLine: null } as any);
    });

    expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();
  });

  // --- loadBookmarks useEffect ---

  it("loads bookmarks when repoId is provided", () => {
    const loadBookmarks = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      loadBookmarks,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);

    expect(loadBookmarks).toHaveBeenCalledWith("repo-1");
  });

  it("does not load bookmarks when repoId is null", () => {
    const loadBookmarks = vi.fn();
    useBookmarkStore.setState({
      bookmarks: {},
      loadBookmarks,
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId={null} />);

    expect(loadBookmarks).not.toHaveBeenCalled();
  });

  // --- Edge case: test runner cleanup when model still exists ---

  it("cleans up test markers on unmount when editor model still exists", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({ suites: {} });

    const { unmount } = render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();
    mockMonaco.editor.setModelMarkers.mockClear();

    unmount();

    // The cleanup function should clear markers
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      expect.anything(),
      "test-runner",
      [],
    );
  });

  // --- Bookmarks from store with no entry for repoId ---

  it("uses empty bookmarks when repoId has no bookmarks in store", () => {
    useBookmarkStore.setState({
      bookmarks: {},
    } as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);
    triggerMount();

    const decorations = mockEditor.createDecorationsCollection.mock.calls[0][0];
    expect(decorations).toHaveLength(0);
  });

  // --- Test failure message with colon-line format ---

  it("extracts line number from colon format in failure message", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "test1", status: "failed", failureMessage: "Error at /src/test.ts:42:", duration: 10 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].startLineNumber).toBe(42);
  });

  it("extracts line number from 'line N' format in failure message", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "test1", status: "failed", failureMessage: "Failed at line 15", duration: 10 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    const markerCall = calls.find((c: any) => c[2].length > 0);
    expect(markerCall).toBeDefined();
    expect(markerCall![2][0].startLineNumber).toBe(15);
  });

  // --- Test runner effect: no model on editor ---

  it("does not set markers when editor model is null", () => {
    // Make getModel return null for this test
    mockEditor.getModel.mockReturnValue(null as any);

    render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);

    // The test runner effect should bail out because model is null
    // setModelMarkers should NOT be called since we bailed early
    expect(mockMonaco.editor.setModelMarkers).not.toHaveBeenCalled();
  });

  it("cleanup skips clearing markers when getModel returns null on unmount", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({ suites: {} });

    // getModel returns a valid model initially so the effect sets up the subscription
    mockEditor.getModel.mockReturnValue(mockModel);

    const { unmount } = render(<FileViewerPanel tab={baseTab} repoId="repo-1" />);

    // Now make getModel return null before unmount, so the cleanup's
    // `if (monacoRef.current && editor.getModel())` evaluates to false
    mockEditor.getModel.mockReturnValue(null as any);
    mockMonaco.editor.setModelMarkers.mockClear();

    unmount();

    // The cleanup should NOT call setModelMarkers since editor.getModel() returns null
    expect(mockMonaco.editor.setModelMarkers).not.toHaveBeenCalled();
  });

  // --- Failed test with no failureMessage (falsy) ---

  it("skips failed tests with no failureMessage", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useTestRunnerStore.setState({
      suites: {
        "ws-1": [
          {
            name: "test.ts",
            tests: [
              { name: "test1", status: "failed", failureMessage: null, duration: 10 },
            ],
          },
        ],
      },
    } as any);

    render(<FileViewerPanel tab={{ ...baseTab, filePath: "/src/test.ts" }} repoId="repo-1" />);
    triggerMount();

    // All marker calls should have empty arrays since failureMessage is null
    const calls = mockMonaco.editor.setModelMarkers.mock.calls;
    calls.forEach((c: any) => {
      expect(c[2]).toEqual([]);
    });
  });
});
