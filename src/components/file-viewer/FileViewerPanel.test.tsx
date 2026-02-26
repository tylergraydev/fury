import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn(),
}));

const mockOnChange = vi.fn();
const mockEditor = {
  onMouseDown: vi.fn(),
  addAction: vi.fn(),
  revealLineInCenter: vi.fn(),
  setPosition: vi.fn(),
  createDecorationsCollection: vi.fn(() => ({ clear: vi.fn() })),
};
const mockMonaco = {
  editor: { MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 } },
  Range: vi.fn(),
};
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, language, onChange, onMount }: any) => {
    // Store the onChange handler so tests can simulate edits
    mockOnChange.mockImplementation(onChange);
    // Call onMount immediately with mock editor and monaco
    if (onMount) setTimeout(() => onMount(mockEditor, mockMonaco), 0);
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
import type { FileTab } from "../../stores/fileViewerStore";

beforeEach(() => {
  useFileViewerStore.setState({ tabs: [], activeTabId: null });
  vi.clearAllMocks();
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

describe("FileViewerPanel", () => {
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

  it("handleChange updates content and notifies copilot when value is defined", async () => {
    const { notifyDocumentChanged } = await import("../../lib/copilot");
    const updateContent = vi.fn();
    useFileViewerStore.setState({ updateContent });
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    // Simulate the onChange handler being called with a value
    mockOnChange("updated content");
    expect(updateContent).toHaveBeenCalledWith("tab-1", "updated content");
    expect(notifyDocumentChanged).toHaveBeenCalledWith("/src/test.ts", "updated content");
  });

  it("handleChange does nothing when value is undefined", async () => {
    const updateContent = vi.fn();
    useFileViewerStore.setState({ updateContent });
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    // Simulate onChange with undefined
    mockOnChange(undefined);
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("handleMount notifies copilot with document opened", async () => {
    const { notifyDocumentOpened } = await import("../../lib/copilot");
    vi.useFakeTimers();
    render(<FileViewerPanel tab={baseTab} repoId={null} />);
    // The onMount is called via setTimeout in the mock
    vi.runAllTimers();
    expect(notifyDocumentOpened).toHaveBeenCalledWith("/src/test.ts", "typescript", "const x = 1;");
    vi.useRealTimers();
  });

  it("handleMount uses editedContent when available", async () => {
    const { notifyDocumentOpened } = await import("../../lib/copilot");
    vi.useFakeTimers();
    render(
      <FileViewerPanel tab={{ ...baseTab, editedContent: "edited" }} repoId={null} />,
    );
    vi.runAllTimers();
    expect(notifyDocumentOpened).toHaveBeenCalledWith("/src/test.ts", "typescript", "edited");
    vi.useRealTimers();
  });

  it("editor value falls back to empty string when both content and editedContent are null", () => {
    render(
      <FileViewerPanel tab={{ ...baseTab, content: null, editedContent: null }} repoId={null} />,
    );
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe("");
  });
});
