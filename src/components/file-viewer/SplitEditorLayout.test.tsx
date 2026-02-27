import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  PanelResizeHandle: ({ className }: { className?: string }) => (
    <div data-testid="resize-handle" className={className} />
  ),
}));

vi.mock("./FileViewerPanel", () => ({
  FileViewerPanel: ({ tab }: { tab: { filePath: string } }) => (
    <div data-testid="file-viewer-panel">{tab.filePath}</div>
  ),
}));

vi.mock("../chat/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat</div>,
}));

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn(),
}));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
}));

import { SplitEditorLayout } from "./SplitEditorLayout";
import { useFileViewerStore } from "../../stores/fileViewerStore";

const makeTab = (overrides: Record<string, unknown> = {}) => ({
  id: "tab-1",
  filePath: "src/main.ts",
  contextId: "ws-1",
  contextType: "workspace" as const,
  content: null,
  editedContent: null,
  language: "typescript",
  loading: false,
  saving: false,
  error: null,
  pinned: false,
  dirty: false,
  ...overrides,
});

const defaultProps = {
  repoId: "repo-1",
  contextId: "ws-1",
  contextType: "workspace" as const,
};

beforeEach(() => {
  useFileViewerStore.setState({
    tabs: [],
    activeTabId: null,
    splitActive: true,
    focusedPane: "left",
    leftActiveTabId: null,
    rightActiveTabId: null,
  });
  vi.clearAllMocks();
});

describe("SplitEditorLayout", () => {
  it("renders two panels with a resize handle", () => {
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByTestId("panel-group")).toBeInTheDocument();
    expect(screen.getAllByTestId("panel")).toHaveLength(2);
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("shows ChatPanel in left pane when no left tab", () => {
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("shows FileViewerPanel in left pane when left tab exists", () => {
    const tab = makeTab({ id: "tab-1", filePath: "src/left.ts" });
    useFileViewerStore.setState({
      tabs: [tab],
      leftActiveTabId: "tab-1",
    });
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByText("src/left.ts")).toBeInTheDocument();
  });

  it("shows FileViewerPanel in right pane when right tab exists", () => {
    const tab = makeTab({ id: "tab-2", filePath: "src/right.ts" });
    useFileViewerStore.setState({
      tabs: [tab],
      rightActiveTabId: "tab-2",
    });
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByText("src/right.ts")).toBeInTheDocument();
  });

  it("shows placeholder in right pane when no right tab", () => {
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByText("Open a file to view it here")).toBeInTheDocument();
  });

  it("renders both panes with different files", () => {
    const leftTab = makeTab({ id: "tab-1", filePath: "src/left.ts" });
    const rightTab = makeTab({ id: "tab-2", filePath: "src/right.ts" });
    useFileViewerStore.setState({
      tabs: [leftTab, rightTab],
      leftActiveTabId: "tab-1",
      rightActiveTabId: "tab-2",
    });
    render(<SplitEditorLayout {...defaultProps} />);
    expect(screen.getByText("src/left.ts")).toBeInTheDocument();
    expect(screen.getByText("src/right.ts")).toBeInTheDocument();
  });

  it("calls setFocusedPane on mouseDown", () => {
    const setFocusedPane = vi.fn();
    const tab = makeTab({ id: "tab-2", filePath: "src/right.ts" });
    useFileViewerStore.setState({
      tabs: [tab],
      rightActiveTabId: "tab-2",
      setFocusedPane,
    });
    render(<SplitEditorLayout {...defaultProps} />);

    // Click on the right pane area (the placeholder or file viewer)
    const rightText = screen.getByText("src/right.ts");
    fireEvent.mouseDown(rightText.closest("[class='h-full']")!);
    expect(setFocusedPane).toHaveBeenCalledWith("right");
  });

  it("focused pane has accent outline", () => {
    const leftTab = makeTab({ id: "tab-1", filePath: "src/left.ts" });
    const rightTab = makeTab({ id: "tab-2", filePath: "src/right.ts" });
    useFileViewerStore.setState({
      tabs: [leftTab, rightTab],
      leftActiveTabId: "tab-1",
      rightActiveTabId: "tab-2",
      focusedPane: "left",
    });
    render(<SplitEditorLayout {...defaultProps} />);

    const paneWrappers = screen.getByTestId("panel-group").querySelectorAll("[class='h-full']");
    // Left pane (focused) should have accent outline
    expect(paneWrappers[0]).toHaveStyle({ outline: "1px solid var(--accent)" });
    // Right pane (unfocused) should have no outline
    expect(paneWrappers[1]).toHaveStyle({ outline: "none" });
  });
});
