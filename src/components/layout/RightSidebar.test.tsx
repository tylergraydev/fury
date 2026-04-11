import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// Store callbacks from the bottom Panel to simulate collapse/expand
let capturedPanelProps: {
  onCollapse?: () => void;
  onExpand?: () => void;
  ref?: React.Ref<any>;
} = {};

// When collapse/expand is called on the imperative handle, simulate
// react-resizable-panels by firing the captured onCollapse/onExpand callback.
const mockPanelExpand = vi.fn(() => {
  capturedPanelProps.onExpand?.();
});
const mockPanelCollapse = vi.fn(() => {
  capturedPanelProps.onCollapse?.();
});

vi.mock("react-resizable-panels", () => ({
  Panel: React.forwardRef(({ children, onCollapse, onExpand }: any, ref: any) => {
    // If this panel has onCollapse/onExpand, it's the bottom panel
    if (onCollapse || onExpand) {
      capturedPanelProps = { onCollapse, onExpand, ref };
      // Provide imperative handle methods via ref
      if (ref && typeof ref === "object") {
        ref.current = {
          expand: mockPanelExpand,
          collapse: mockPanelCollapse,
        };
      }
    }
    return <div data-testid="panel">{children}</div>;
  }),
  PanelGroup: ({ children }: any) => <div data-testid="panel-group">{children}</div>,
  PanelResizeHandle: ({ className }: any) => <div data-testid="resize-handle" className={className} />,
}));

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({ ensureTypesLoaded: vi.fn() }));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  ChevronUp: () => <span data-testid="chevron-up" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  ArrowDown: () => <span data-testid="arrow-down" />,
  ArrowUp: () => <span data-testid="arrow-up" />,
  RefreshCw: ({ className }: any) => <span data-testid="refresh-cw" className={className} />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  GitCompare: () => <span data-testid="icon-gitcompare" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,
  Loader2: () => <span data-testid="icon-loader2" />,
  CheckCircle2: () => <span data-testid="icon-checkcircle2" />,
  XCircle: () => <span data-testid="icon-xcircle" />,
  Terminal: () => <span data-testid="icon-terminal" />,
  GitBranch: () => <span data-testid="icon-gitbranch" />,
}));

// Capture FileTreePanel props so we can invoke the callbacks
let capturedFileTreeProps: {
  onFileClick?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onRunTestFile?: (path: string) => void;
} = {};

vi.mock("../sidebar/FileTreePanel", () => ({
  FileTreePanel: (props: any) => {
    capturedFileTreeProps = {
      onFileClick: props.onFileClick,
      onFileDoubleClick: props.onFileDoubleClick,
      onRunTestFile: props.onRunTestFile,
    };
    return <div data-testid="file-tree-panel" />;
  },
}));
vi.mock("../sidebar/ChangesPanel", () => ({
  ChangesPanel: () => <div data-testid="changes-panel" />,
}));
vi.mock("../sidebar/ChecksPanel", () => ({
  ChecksPanel: () => <div data-testid="checks-panel" />,
}));
// BookmarksPanel is now rendered inside FileTreePanel via toggle
vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));
vi.mock("../terminal/RunPanel", () => ({
  RunPanel: () => <div data-testid="run-panel" />,
}));
vi.mock("../terminal/SetupPanel", () => ({
  SetupPanel: () => <div data-testid="setup-panel" />,
}));
vi.mock("../ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

import { RightSidebar } from "./RightSidebar";
import { useUIStore } from "../../stores/uiStore";
import { useDiffStore } from "../../stores/diffStore";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useMergeStore } from "../../stores/mergeStore";
import { useTestRunnerStore } from "../../stores/testRunnerStore";

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  listWorkspaceFiles: vi.fn().mockResolvedValue([]),
  readWorkspaceFile: vi.fn().mockResolvedValue({ content: "", language: "text" }),
  writeWorkspaceFile: vi.fn().mockResolvedValue({ content: "", language: "text", formatted: false }),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useUIStore.setState({
    rightSidebarTab: "files",
    bottomTab: "terminal",
  });
  useDiffStore.setState({
    diffResults: {},
  });
  useMergeStore.setState({
    branchStatus: {},
    syncing: {},
    syncError: {},
    loading: {},
    error: {},
  });
  capturedPanelProps = {};
  capturedFileTreeProps = {};
  mockPanelExpand.mockClear();
  mockPanelCollapse.mockClear();
  vi.clearAllMocks();
});

describe("RightSidebar", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };
  const repoContext = { id: "r1", type: "repo" as const };

  it("renders tab bar with All files, Changes, Checks tabs for workspace", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("All files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Checks")).toBeInTheDocument();
  });

  it("renders only All files and Changes for repo context", () => {
    render(<RightSidebar context={repoContext} />);
    expect(screen.getByText("All files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.queryByText("Checks")).not.toBeInTheDocument();
  });

  it("shows FileTreePanel by default", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
  });

  it("switches to Changes tab", () => {
    render(<RightSidebar context={wsContext} />);
    fireEvent.click(screen.getByText("Changes"));
    expect(screen.getByTestId("changes-panel")).toBeInTheDocument();
  });

  it("shows bottom panel tabs (Setup, Run, Terminal)", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("shows change count in Changes tab label", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "a.ts", status: "modified", additions: 1, deletions: 0 },
            { path: "b.ts", status: "added", additions: 2, deletions: 0 },
          ],
          totalAdditions: 3,
          totalDeletions: 0,
        },
      },
    });
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("Changes 2")).toBeInTheDocument();
  });

  // --- Tab switching ---
  describe("Tab switching", () => {
    it("switches to Checks tab and shows ChecksPanel for workspace", () => {
      render(<RightSidebar context={wsContext} />);
      fireEvent.click(screen.getByText("Checks"));
      expect(screen.getByTestId("checks-panel")).toBeInTheDocument();
    });

    it("switches back to All files tab", () => {
      useUIStore.setState({ rightSidebarTab: "changes" });
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("changes-panel")).toBeInTheDocument();

      fireEvent.click(screen.getByText("All files"));
      expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
    });

    it("resets to files tab when switching from workspace to repo context with checks active", () => {
      // Start with checks tab active
      useUIStore.setState({ rightSidebarTab: "checks" });

      // Render with repo context - should trigger the useEffect to reset to "files"
      render(<RightSidebar context={repoContext} />);

      // The tab should have been reset to "files"
      expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
    });

    it("does not show ChecksPanel for repo context even if tab is checks", () => {
      useUIStore.setState({ rightSidebarTab: "checks" });
      render(<RightSidebar context={repoContext} />);

      // The checks panel should not render for repo context
      expect(screen.queryByTestId("checks-panel")).not.toBeInTheDocument();
    });
  });

  // --- Bottom panel tab switching ---
  describe("Bottom panel tab switching", () => {
    it("shows TerminalPanel by default", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    });

    it("switches to Setup tab and shows SetupPanel", () => {
      render(<RightSidebar context={wsContext} />);
      fireEvent.click(screen.getByText("Setup"));
      expect(screen.getByTestId("setup-panel")).toBeInTheDocument();
    });

    it("switches to Run tab and shows RunPanel", () => {
      render(<RightSidebar context={wsContext} />);
      fireEvent.click(screen.getByText("Run"));
      expect(screen.getByTestId("run-panel")).toBeInTheDocument();
    });

    it("switches between bottom tabs correctly", () => {
      render(<RightSidebar context={wsContext} />);

      // Switch to Setup
      fireEvent.click(screen.getByText("Setup"));
      expect(screen.getByTestId("setup-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();

      // Switch to Run
      fireEvent.click(screen.getByText("Run"));
      expect(screen.getByTestId("run-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("setup-panel")).not.toBeInTheDocument();

      // Switch back to Terminal
      fireEvent.click(screen.getByText("Terminal"));
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
    });
  });

  // --- Bottom panel collapse/expand ---
  describe("Bottom panel collapse/expand", () => {
    it("shows collapse button with ChevronDown when expanded", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTitle("Collapse panel")).toBeInTheDocument();
      expect(screen.getByTestId("chevron-down")).toBeInTheDocument();
    });

    it("collapses when toggle button clicked while expanded", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

      const toggleBtn = screen.getByTitle("Collapse panel");
      fireEvent.click(toggleBtn);

      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();
    });

    it("shows expand button with ChevronUp when collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse via toggle button
      fireEvent.click(screen.getByTitle("Collapse panel"));

      expect(screen.getByTitle("Expand panel")).toBeInTheDocument();
      expect(screen.getByTestId("chevron-up")).toBeInTheDocument();
    });

    it("expands when toggle button clicked while collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse first
      fireEvent.click(screen.getByTitle("Collapse panel"));
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByTitle("Expand panel"));
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    });

    it("hides terminal content when collapsed", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

      fireEvent.click(screen.getByTitle("Collapse panel"));
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();
    });

    it("shows terminal content again when expanded", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse
      fireEvent.click(screen.getByTitle("Collapse panel"));
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByTitle("Expand panel"));
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    });

    it("does not show border-bottom on toolbar when collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      const toolbarDiv = screen.getByText("Setup").closest(".flex.items-center")! as HTMLElement;
      expect(toolbarDiv.style.borderBottom).toBe("1px solid var(--border)");

      fireEvent.click(screen.getByTitle("Collapse panel"));
      expect(toolbarDiv.style.borderBottom).toBe("");
    });

    it("expands bottom panel when clicking a tab while collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse
      fireEvent.click(screen.getByTitle("Collapse panel"));
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();

      // Click on Setup tab while collapsed — should expand
      fireEvent.click(screen.getByText("Setup"));
      expect(screen.getByTestId("setup-panel")).toBeInTheDocument();
    });
  });

  // --- File click callbacks ---
  describe("File click callbacks", () => {
    it("calls openFile on file click", () => {
      const openFileMock = vi.fn();
      useFileViewerStore.setState({ openFile: openFileMock });
      const setActiveViewTabMock = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        setActiveViewTab: setActiveViewTabMock,
      });

      render(<RightSidebar context={wsContext} />);

      // Invoke the captured onFileClick callback from FileTreePanel
      expect(capturedFileTreeProps.onFileClick).toBeDefined();
      act(() => {
        capturedFileTreeProps.onFileClick!("src/index.ts");
      });

      expect(openFileMock).toHaveBeenCalledWith("ws-1", "workspace", "src/index.ts");
      expect(setActiveViewTabMock).toHaveBeenCalledWith("chat");
    });

    it("calls openFile with pin=true on file double-click", () => {
      const openFileMock = vi.fn();
      useFileViewerStore.setState({ openFile: openFileMock });
      const setActiveViewTabMock = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        setActiveViewTab: setActiveViewTabMock,
      });

      render(<RightSidebar context={wsContext} />);

      expect(capturedFileTreeProps.onFileDoubleClick).toBeDefined();
      act(() => {
        capturedFileTreeProps.onFileDoubleClick!("src/app.ts");
      });

      expect(openFileMock).toHaveBeenCalledWith("ws-1", "workspace", "src/app.ts", true);
      expect(setActiveViewTabMock).toHaveBeenCalledWith("chat");
    });

    it("uses repo context type for file click when context is repo", () => {
      const openFileMock = vi.fn();
      useFileViewerStore.setState({ openFile: openFileMock });
      const setActiveViewTabMock = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        setActiveViewTab: setActiveViewTabMock,
      });

      render(<RightSidebar context={repoContext} />);

      act(() => {
        capturedFileTreeProps.onFileClick!("src/main.ts");
      });

      expect(openFileMock).toHaveBeenCalledWith("r1", "repo", "src/main.ts");
    });

    it("uses repo context type for file double-click when context is repo", () => {
      const openFileMock = vi.fn();
      useFileViewerStore.setState({ openFile: openFileMock });
      const setActiveViewTabMock = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        setActiveViewTab: setActiveViewTabMock,
      });

      render(<RightSidebar context={repoContext} />);

      act(() => {
        capturedFileTreeProps.onFileDoubleClick!("src/main.ts");
      });

      expect(openFileMock).toHaveBeenCalledWith("r1", "repo", "src/main.ts", true);
    });
  });

  // --- Active tab styling ---
  describe("Active tab styling", () => {
    it("highlights the active top tab with accent color", () => {
      render(<RightSidebar context={wsContext} />);
      const allFilesBtn = screen.getByText("All files");
      expect(allFilesBtn).toHaveStyle({ color: "var(--accent)" });
    });

    it("shows inactive top tab with muted color", () => {
      render(<RightSidebar context={wsContext} />);
      const changesBtn = screen.getByText("Changes");
      expect(changesBtn).toHaveStyle({ color: "var(--text-muted)" });
    });

    it("highlights the active bottom tab with accent color and bg-surface", () => {
      render(<RightSidebar context={wsContext} />);
      const terminalSpan = screen.getByText("Terminal");
      expect(terminalSpan).toHaveStyle({ color: "var(--accent)" });
      expect(terminalSpan).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
    });

    it("shows inactive bottom tab with muted color", () => {
      render(<RightSidebar context={wsContext} />);
      const setupSpan = screen.getByText("Setup");
      expect(setupSpan).toHaveStyle({ color: "var(--text-muted)" });
    });
  });

  // --- Resize handle ---
  describe("Resize handle", () => {
    it("renders the vertical resize handle between panels", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
      expect(screen.getByTestId("resize-handle")).toHaveClass("resize-handle-v");
    });
  });

  // --- Sync button ---
  describe("SyncButton", () => {
    it("renders sync button in the tab bar", () => {
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Sync with remote");
      expect(btn).toBeInTheDocument();
    });

    it("shows behind count when behind remote", () => {
      useMergeStore.setState({
        branchStatus: {
          "ws-1": {
            branch: "fix-bug",
            defaultBranch: "main",
            ahead: 0,
            behind: 3,
            hasUpstream: true,
          },
        },
      });
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByTestId("arrow-down")).toBeInTheDocument();
    });

    it("shows ahead count when ahead of remote", () => {
      useMergeStore.setState({
        branchStatus: {
          "ws-1": {
            branch: "fix-bug",
            defaultBranch: "main",
            ahead: 2,
            behind: 0,
            hasUpstream: true,
          },
        },
      });
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByTestId("arrow-up")).toBeInTheDocument();
    });

    it("calls syncBranch on click", () => {
      const syncSpy = vi.fn();
      useMergeStore.setState({ syncBranch: syncSpy } as any);
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Sync with remote");
      fireEvent.click(btn);
      expect(syncSpy).toHaveBeenCalledWith("ws-1");
    });

    it("disables button while syncing", () => {
      useMergeStore.setState({
        syncing: { "ws-1": true },
      });
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Sync with remote");
      expect(btn).toBeDisabled();
    });

    it("shows sync error in title", () => {
      useMergeStore.setState({
        syncError: { "ws-1": "Push failed" },
      });
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Push failed");
      expect(btn).toBeInTheDocument();
    });

    it("does not call syncBranch when already syncing", () => {
      const syncSpy = vi.fn();
      useMergeStore.setState({
        syncing: { "ws-1": true },
        syncBranch: syncSpy,
      } as any);
      render(<RightSidebar context={wsContext} />);
      // The button is disabled, but let's also verify handleSync guards
      const btn = screen.getByTitle("Sync with remote");
      fireEvent.click(btn);
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it("shows both ahead and behind counts simultaneously", () => {
      useMergeStore.setState({
        branchStatus: {
          "ws-1": {
            branch: "fix-bug",
            defaultBranch: "main",
            ahead: 4,
            behind: 2,
            hasUpstream: true,
          },
        },
      });
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByTestId("arrow-up")).toBeInTheDocument();
      expect(screen.getByTestId("arrow-down")).toBeInTheDocument();
    });

    it("shows spinning RefreshCw while syncing", () => {
      useMergeStore.setState({
        syncing: { "ws-1": true },
      });
      render(<RightSidebar context={wsContext} />);
      const spinner = screen.getByTestId("refresh-cw");
      expect(spinner).toHaveClass("h-3.5 w-3.5 animate-spin");
    });

    it("shows error color on button when syncError is set", () => {
      useMergeStore.setState({
        syncError: { "ws-1": "Push failed" },
      });
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Push failed");
      expect(btn).toHaveStyle({ color: "var(--error)" });
    });

    it("shows accent color on button when syncing", () => {
      useMergeStore.setState({
        syncing: { "ws-1": true },
      });
      render(<RightSidebar context={wsContext} />);
      const btn = screen.getByTitle("Sync with remote");
      expect(btn).toHaveStyle({ color: "var(--accent)" });
    });

    it("calls loadBranchStatus via double-rAF on mount", () => {
      const loadBranchStatusSpy = vi.fn();
      useMergeStore.setState({ loadBranchStatus: loadBranchStatusSpy } as any);

      // Make rAF synchronous for this test
      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

      render(<RightSidebar context={wsContext} />);

      expect(loadBranchStatusSpy).toHaveBeenCalledWith("ws-1");

      globalThis.requestAnimationFrame = originalRAF;
    });
  });

  // --- Double-rAF diff loading ---
  describe("Diff loading via double-rAF", () => {
    it("calls loadDiff for workspace context when no cached result", () => {
      const loadDiffSpy = vi.fn();
      useDiffStore.setState({ diffResults: {}, loadDiff: loadDiffSpy } as any);

      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

      render(<RightSidebar context={wsContext} />);

      expect(loadDiffSpy).toHaveBeenCalledWith("ws-1");

      globalThis.requestAnimationFrame = originalRAF;
    });

    it("calls loadRepoDiff for repo context when no cached result", () => {
      const loadRepoDiffSpy = vi.fn();
      useDiffStore.setState({ diffResults: {}, loadRepoDiff: loadRepoDiffSpy } as any);

      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

      render(<RightSidebar context={repoContext} />);

      expect(loadRepoDiffSpy).toHaveBeenCalledWith("r1");

      globalThis.requestAnimationFrame = originalRAF;
    });

    it("skips diff loading when result is already cached", () => {
      const loadDiffSpy = vi.fn();
      useDiffStore.setState({
        diffResults: {
          "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 },
        },
        loadDiff: loadDiffSpy,
      } as any);

      const originalRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

      render(<RightSidebar context={wsContext} />);

      expect(loadDiffSpy).not.toHaveBeenCalled();

      globalThis.requestAnimationFrame = originalRAF;
    });
  });

  // --- Run test file callback ---
  describe("Run test file callback", () => {
    it("calls runTests and opens tests view tab on run test file", () => {
      const runTestsSpy = vi.fn();
      useTestRunnerStore.setState({ runTests: runTestsSpy } as any);
      const openViewTabSpy = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        openViewTab: openViewTabSpy,
      });

      render(<RightSidebar context={wsContext} />);

      expect(capturedFileTreeProps.onRunTestFile).toBeDefined();
      act(() => {
        capturedFileTreeProps.onRunTestFile!("src/utils.test.ts");
      });

      expect(runTestsSpy).toHaveBeenCalledWith("ws-1", "workspace", "src/utils.test.ts");
      expect(openViewTabSpy).toHaveBeenCalledWith("tests");
    });

    it("uses repo context type for run test file when context is repo", () => {
      const runTestsSpy = vi.fn();
      useTestRunnerStore.setState({ runTests: runTestsSpy } as any);
      const openViewTabSpy = vi.fn();
      useUIStore.setState({
        rightSidebarTab: "files",
        bottomTab: "terminal",
        openViewTab: openViewTabSpy,
      });

      render(<RightSidebar context={repoContext} />);

      act(() => {
        capturedFileTreeProps.onRunTestFile!("src/utils.test.ts");
      });

      expect(runTestsSpy).toHaveBeenCalledWith("r1", "repo", "src/utils.test.ts");
    });
  });

  // --- Defensive guard coverage ---
  describe("Defensive guards", () => {
    it("toggleBottomPanel does nothing when panel ref is null", () => {
      // Override the Panel mock to NOT set ref for the bottom panel
      // ref captured but unused - toggle test only needs the null override below
      render(<RightSidebar context={wsContext} />);
      // Null out the ref to simulate missing panel
      if (capturedPanelProps.ref && typeof capturedPanelProps.ref === "object") {
        (capturedPanelProps.ref as React.MutableRefObject<any>).current = null;
      }
      // Click the toggle button - should early return without error
      const toggleBtn = screen.getByTitle("Collapse panel");
      fireEvent.click(toggleBtn);
      // The panel should still show as expanded since collapse was not called
      expect(mockPanelCollapse).not.toHaveBeenCalled();
      expect(mockPanelExpand).not.toHaveBeenCalled();
    });
  });
});
