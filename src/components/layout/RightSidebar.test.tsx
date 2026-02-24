import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

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

// Store callbacks from the bottom Panel to simulate collapse/expand
let capturedPanelProps: {
  onCollapse?: () => void;
  onExpand?: () => void;
  ref?: React.Ref<any>;
} = {};

const mockPanelExpand = vi.fn();
const mockPanelCollapse = vi.fn();

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
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("lucide-react", () => ({
  ChevronUp: () => <span data-testid="chevron-up" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  ArrowDown: () => <span data-testid="arrow-down" />,
  ArrowUp: () => <span data-testid="arrow-up" />,
  RefreshCw: ({ className }: any) => <span data-testid="refresh-cw" className={className} />,
}));

// Capture FileTreePanel props so we can invoke the callbacks
let capturedFileTreeProps: {
  onFileClick?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
} = {};

vi.mock("../sidebar/FileTreePanel", () => ({
  FileTreePanel: (props: any) => {
    capturedFileTreeProps = {
      onFileClick: props.onFileClick,
      onFileDoubleClick: props.onFileDoubleClick,
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
            { path: "a.ts", status: "Modified", additions: 1, deletions: 0 },
            { path: "b.ts", status: "Added", additions: 2, deletions: 0 },
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

    it("calls panel collapse when toggle button clicked while expanded", () => {
      render(<RightSidebar context={wsContext} />);
      const toggleBtn = screen.getByTitle("Collapse panel");
      fireEvent.click(toggleBtn);
      expect(mockPanelCollapse).toHaveBeenCalled();
    });

    it("shows expand button with ChevronUp when collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Simulate the panel being collapsed via the onCollapse callback
      act(() => {
        capturedPanelProps.onCollapse?.();
      });

      expect(screen.getByTitle("Expand panel")).toBeInTheDocument();
      expect(screen.getByTestId("chevron-up")).toBeInTheDocument();
    });

    it("calls panel expand when toggle button clicked while collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // First collapse
      act(() => {
        capturedPanelProps.onCollapse?.();
      });

      const toggleBtn = screen.getByTitle("Expand panel");
      fireEvent.click(toggleBtn);
      expect(mockPanelExpand).toHaveBeenCalled();
    });

    it("hides terminal content when collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Terminal panel should be visible initially
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

      // Collapse the panel
      act(() => {
        capturedPanelProps.onCollapse?.();
      });

      // Terminal panel should be hidden
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();
    });

    it("shows terminal content again when expanded", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse
      act(() => {
        capturedPanelProps.onCollapse?.();
      });
      expect(screen.queryByTestId("terminal-panel")).not.toBeInTheDocument();

      // Expand
      act(() => {
        capturedPanelProps.onExpand?.();
      });
      expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    });

    it("does not show border-bottom on toolbar when collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Get the bottom toolbar div (the one containing Setup/Run/Terminal)
      const toolbarDiv = screen.getByText("Setup").closest(".flex.items-center")! as HTMLElement;
      // Initially has border-bottom
      expect(toolbarDiv.style.borderBottom).toBe("1px solid var(--border)");

      // Collapse
      act(() => {
        capturedPanelProps.onCollapse?.();
      });

      // After collapse, borderBottom should be removed
      expect(toolbarDiv.style.borderBottom).toBe("");
    });

    it("expands bottom panel when clicking a tab while collapsed", () => {
      render(<RightSidebar context={wsContext} />);

      // Collapse the panel
      act(() => {
        capturedPanelProps.onCollapse?.();
      });

      // Click on Setup tab while collapsed
      fireEvent.click(screen.getByText("Setup"));

      // Should have called expand on the panel ref
      expect(mockPanelExpand).toHaveBeenCalled();
    });

    it("does not expand bottom panel when clicking a tab while already expanded", () => {
      render(<RightSidebar context={wsContext} />);

      // Click on Setup tab while NOT collapsed
      fireEvent.click(screen.getByText("Setup"));

      // Should NOT have called expand
      expect(mockPanelExpand).not.toHaveBeenCalled();
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
    it("renders the resize handle between panels", () => {
      render(<RightSidebar context={wsContext} />);
      expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
    });
  });

  // --- Toggle bottom panel with null ref (edge case) ---
  describe("Toggle with null panel ref", () => {
    it("does nothing when toggle is clicked and panel ref is null", () => {
      // Temporarily clear the panel ref
      render(<RightSidebar context={wsContext} />);

      // Before clicking toggle, set ref.current to null
      if (capturedPanelProps.ref && typeof capturedPanelProps.ref === "object") {
        (capturedPanelProps.ref as any).current = null;
      }

      const toggleBtn = screen.getByTitle("Collapse panel");
      fireEvent.click(toggleBtn);

      // Should not throw and should not call expand/collapse
      expect(mockPanelCollapse).not.toHaveBeenCalled();
      expect(mockPanelExpand).not.toHaveBeenCalled();
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
  });
});
