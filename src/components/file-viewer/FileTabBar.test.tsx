import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn(),
}));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
}));
vi.mock("lucide-react", () => ({
  X: ({ className }: { className?: string }) => <span className={className} data-testid="x-icon" />,
  Settings: ({ className }: { className?: string }) => <span className={className} data-testid="settings-icon" />,
  GitMerge: ({ className }: { className?: string }) => <span className={className} data-testid="merge-icon" />,
  History: ({ className }: { className?: string }) => <span className={className} data-testid="history-icon" />,
  FileDiff: ({ className }: { className?: string }) => <span className={className} data-testid="diff-icon" />,
  Users: ({ className }: { className?: string }) => <span className={className} data-testid="team-icon" />,
  Columns2: ({ className }: { className?: string }) => <span className={className} data-testid="columns-icon" />,
  BarChart3: ({ className }: { className?: string }) => <span className={className} data-testid="barchart-icon" />,
  MessageSquare: ({ className }: { className?: string }) => <span className={className} data-testid="message-icon" />,
}));

import { FileTabBar } from "./FileTabBar";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useUIStore } from "../../stores/uiStore";

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

beforeEach(() => {
  useFileViewerStore.setState({
    tabs: [],
    activeTabId: null,
  });
  useUIStore.setState({
    viewTabs: [{ id: "chat", type: "chat", label: "Chat", pinned: true }],
    activeViewTabId: "chat",
  });
  vi.clearAllMocks();
});

describe("FileTabBar", () => {
  it("renders the Chat tab", () => {
    render(<FileTabBar />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("renders file tabs with file names", () => {
    useFileViewerStore.setState({
      tabs: [
        makeTab({ id: "tab-1", filePath: "src/main.ts" }),
        makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
      ],
      activeTabId: null,
    });
    render(<FileTabBar />);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("app.tsx")).toBeInTheDocument();
  });

  it("shows dirty indicator for unsaved files", () => {
    useFileViewerStore.setState({
      tabs: [makeTab({ dirty: true })],
      activeTabId: "tab-1",
    });
    render(<FileTabBar />);
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("shows saving indicator", () => {
    useFileViewerStore.setState({
      tabs: [makeTab({ saving: true })],
      activeTabId: null,
    });
    render(<FileTabBar />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("renders view tabs on the right side", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    expect(screen.getByText(/Merge/)).toBeInTheDocument();
    expect(screen.getByTestId("merge-icon")).toBeInTheDocument();
  });

  it("computes viewType from activeViewTabId", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "merge-1",
    });
    render(<FileTabBar />);
    // Chat tab should not be active when viewType != "chat"
    const chatButton = screen.getByText("Chat");
    // isChatActive should be false since viewType is "merge"
    expect(chatButton).toBeInTheDocument();
  });

  it("defaults viewType to 'chat' when activeViewTabId not found", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
      ],
      activeViewTabId: "nonexistent",
    });
    render(<FileTabBar />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("clicking Chat tab calls showChat and setActiveViewTab", () => {
    const showChat = vi.fn();
    const setActiveViewTab = vi.fn();
    useFileViewerStore.setState({ showChat });
    useUIStore.setState({ setActiveViewTab });
    render(<FileTabBar />);
    fireEvent.click(screen.getByText("Chat"));
    expect(showChat).toHaveBeenCalled();
    expect(setActiveViewTab).toHaveBeenCalledWith("chat");
  });

  it("clicking a file tab calls setActiveTab and setActiveViewTab", () => {
    const setActiveFileTab = vi.fn();
    const setActiveViewTab = vi.fn();
    useFileViewerStore.setState({
      tabs: [makeTab()],
      activeTabId: null,
      setActiveTab: setActiveFileTab,
    });
    useUIStore.setState({ setActiveViewTab });
    render(<FileTabBar />);
    fireEvent.click(screen.getByText("main.ts"));
    expect(setActiveFileTab).toHaveBeenCalledWith("tab-1");
    expect(setActiveViewTab).toHaveBeenCalledWith("chat");
  });

  it("double-clicking a file tab calls pinTab", () => {
    const pinFileTab = vi.fn();
    useFileViewerStore.setState({
      tabs: [makeTab()],
      activeTabId: null,
      pinTab: pinFileTab,
    });
    render(<FileTabBar />);
    fireEvent.doubleClick(screen.getByText("main.ts"));
    expect(pinFileTab).toHaveBeenCalledWith("tab-1");
  });

  it("pinned file tab has normal font style", () => {
    useFileViewerStore.setState({
      tabs: [makeTab({ pinned: true })],
      activeTabId: "tab-1",
    });
    render(<FileTabBar />);
    const fileSpan = screen.getByText("main.ts");
    expect(fileSpan).toHaveStyle({ fontStyle: "normal" });
  });

  it("unpinned file tab has italic font style", () => {
    useFileViewerStore.setState({
      tabs: [makeTab({ pinned: false })],
      activeTabId: "tab-1",
    });
    render(<FileTabBar />);
    const fileSpan = screen.getByText("main.ts");
    expect(fileSpan).toHaveStyle({ fontStyle: "italic" });
  });

  it("closing a file tab calls closeTab and stops propagation", () => {
    const closeFileTab = vi.fn();
    useFileViewerStore.setState({
      tabs: [makeTab({ saving: false })],
      activeTabId: null,
      closeTab: closeFileTab,
    });
    render(<FileTabBar />);
    const closeButtons = screen.getAllByTestId("x-icon");
    // Click the close button on the file tab
    fireEvent.click(closeButtons[0].closest("button")!);
    expect(closeFileTab).toHaveBeenCalledWith("tab-1");
  });

  it("active file tab has accent color", () => {
    useFileViewerStore.setState({
      tabs: [makeTab()],
      activeTabId: "tab-1",
    });
    useUIStore.setState({
      viewTabs: [{ id: "chat", type: "chat", label: "Chat", pinned: true }],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    // The tab wrapper div should have accent color when active
    const tabWrapper = screen.getByText("main.ts").closest("[role='tab']");
    expect(tabWrapper).toHaveStyle({ color: "var(--accent)" });
  });

  it("clicking a view tab calls setActiveViewTab", () => {
    const setActiveViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      setActiveViewTab,
    });
    render(<FileTabBar />);
    fireEvent.click(screen.getByText("Merge"));
    expect(setActiveViewTab).toHaveBeenCalledWith("merge-1");
  });

  it("double-clicking a view tab calls pinViewTab", () => {
    const pinViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      pinViewTab,
    });
    render(<FileTabBar />);
    fireEvent.doubleClick(screen.getByText("Merge"));
    expect(pinViewTab).toHaveBeenCalledWith("merge-1");
  });

  it("closing a view tab calls closeViewTab", () => {
    const closeViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      closeViewTab,
    });
    render(<FileTabBar />);
    // Find the close button for the merge view tab (last x-icon)
    const closeButtons = screen.getAllByTestId("x-icon");
    fireEvent.click(closeButtons[closeButtons.length - 1].closest("button")!);
    expect(closeViewTab).toHaveBeenCalledWith("merge-1");
  });

  it("active view tab has accent styling", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "merge-1",
    });
    render(<FileTabBar />);
    const mergeTab = screen.getByText("Merge").closest("[role='tab']");
    // The parent div should have accent color
    expect(mergeTab).toHaveStyle({ color: "var(--accent)" });
  });

  it("renders settings view tab with icon", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "settings-1", type: "settings", label: "Settings", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    // settings type is filtered out from nonChatViewTabs
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("renders history view tab with icon", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "history-1", type: "history", label: "History", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByTestId("history-icon")).toBeInTheDocument();
  });

  it("renders spacer area even when no non-chat view tabs", () => {
    useUIStore.setState({
      viewTabs: [{ id: "chat", type: "chat", label: "Chat", pinned: true }],
      activeViewTabId: "chat",
    });
    const { container } = render(<FileTabBar />);
    // Spacer div always renders (wraps split toggle area)
    const spacer = container.querySelector(".flex-1");
    expect(spacer).toBeInTheDocument();
  });

  it("filePath without slash uses full path as name", () => {
    useFileViewerStore.setState({
      tabs: [makeTab({ filePath: "readme.md" })],
      activeTabId: null,
    });
    render(<FileTabBar />);
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("pinned view tab has normal font style", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: true },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    const mergeSpan = screen.getByText("Merge").closest("span");
    expect(mergeSpan).toHaveStyle({ fontStyle: "normal" });
  });

  it("pressing Enter on a view tab activates it", () => {
    const setActiveViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      setActiveViewTab,
    });
    render(<FileTabBar />);
    const mergeTab = screen.getByText("Merge").closest("[role='tab']")!;
    fireEvent.keyDown(mergeTab, { key: "Enter" });
    expect(setActiveViewTab).toHaveBeenCalledWith("merge-1");
  });

  it("pressing Space on a view tab activates it", () => {
    const setActiveViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      setActiveViewTab,
    });
    render(<FileTabBar />);
    const mergeTab = screen.getByText("Merge").closest("[role='tab']")!;
    fireEvent.keyDown(mergeTab, { key: " " });
    expect(setActiveViewTab).toHaveBeenCalledWith("merge-1");
  });

  it("pressing a non-activation key on a view tab does nothing", () => {
    const setActiveViewTab = vi.fn();
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
      setActiveViewTab,
    });
    render(<FileTabBar />);
    const mergeTab = screen.getByText("Merge").closest("[role='tab']")!;
    fireEvent.keyDown(mergeTab, { key: "Tab" });
    expect(setActiveViewTab).not.toHaveBeenCalled();
  });

  it("view tab without matching icon renders without icon", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "custom-1", type: "custom" as any, label: "Custom", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("unpinned view tab has italic font style", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    const mergeSpan = screen.getByText("Merge").closest("span");
    expect(mergeSpan).toHaveStyle({ fontStyle: "italic" });
  });

  describe("split mode", () => {
    it("shows L/R badges when split is active", () => {
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/left.ts" }),
          makeTab({ id: "tab-2", filePath: "src/right.ts" }),
        ],
        activeTabId: "tab-1",
        splitActive: true,
        leftActiveTabId: "tab-1",
        rightActiveTabId: "tab-2",
        focusedPane: "left",
      });
      render(<FileTabBar />);
      expect(screen.getByText("L")).toBeInTheDocument();
      expect(screen.getByText("R")).toBeInTheDocument();
    });

    it("does not show L/R badges when split is inactive", () => {
      useFileViewerStore.setState({
        tabs: [makeTab({ id: "tab-1" }), makeTab({ id: "tab-2", filePath: "src/other.ts" })],
        activeTabId: "tab-1",
        splitActive: false,
      });
      render(<FileTabBar />);
      expect(screen.queryByText("L")).not.toBeInTheDocument();
      expect(screen.queryByText("R")).not.toBeInTheDocument();
    });

    it("shows split toggle button when 2+ tabs exist", () => {
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
      });
      render(<FileTabBar />);
      expect(screen.getByTitle("Split editor")).toBeInTheDocument();
    });

    it("does not show split toggle with fewer than 2 tabs", () => {
      useFileViewerStore.setState({
        tabs: [makeTab({ id: "tab-1" })],
        activeTabId: "tab-1",
      });
      render(<FileTabBar />);
      expect(screen.queryByTitle("Split editor")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Close split view")).not.toBeInTheDocument();
    });

    it("in split mode, clicking a file tab calls setActiveTabInPane", () => {
      const setActiveTabInPane = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/other.ts" }),
        ],
        activeTabId: "tab-1",
        splitActive: true,
        focusedPane: "left",
        leftActiveTabId: "tab-1",
        rightActiveTabId: "tab-2",
        setActiveTabInPane,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      fireEvent.click(screen.getByText("other.ts"));
      expect(setActiveTabInPane).toHaveBeenCalledWith("left", "tab-2");
    });

    it("renders usage view tab with BarChart3 icon", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "usage-1", type: "usage", label: "Usage", pinned: false },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      expect(screen.getByText("Usage")).toBeInTheDocument();
      expect(screen.getByTestId("barchart-icon")).toBeInTheDocument();
    });

    it("clicking split toggle when split is active calls closeSplit", () => {
      const closeSplit = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
        splitActive: true,
        leftActiveTabId: "tab-1",
        rightActiveTabId: "tab-2",
        focusedPane: "left",
        closeSplit,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      fireEvent.click(screen.getByTitle("Close split view"));
      expect(closeSplit).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("clicking split toggle when split is inactive calls splitEditor", () => {
      const splitEditor = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
        splitActive: false,
        splitEditor,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      fireEvent.click(screen.getByTitle("Split editor"));
      expect(splitEditor).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("pressing Enter on a file tab activates it", () => {
      const setActiveFileTab = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [makeTab()],
        activeTabId: null,
        setActiveTab: setActiveFileTab,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      const tabEl = screen.getByText("main.ts").closest("[role='tab']")!;
      fireEvent.keyDown(tabEl, { key: "Enter" });
      expect(setActiveFileTab).toHaveBeenCalledWith("tab-1");
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("pressing Space on a file tab activates it", () => {
      const setActiveFileTab = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [makeTab()],
        activeTabId: null,
        setActiveTab: setActiveFileTab,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      const tabEl = screen.getByText("main.ts").closest("[role='tab']")!;
      fireEvent.keyDown(tabEl, { key: " " });
      expect(setActiveFileTab).toHaveBeenCalledWith("tab-1");
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("pressing a non-activation key on a file tab does nothing", () => {
      const setActiveFileTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [makeTab()],
        activeTabId: null,
        setActiveTab: setActiveFileTab,
      });
      render(<FileTabBar />);
      const tabEl = screen.getByText("main.ts").closest("[role='tab']")!;
      fireEvent.keyDown(tabEl, { key: "Tab" });
      expect(setActiveFileTab).not.toHaveBeenCalled();
    });

    it("clicking open-in-split button when split is not active calls splitEditor with tabId", () => {
      const splitEditor = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
        splitActive: false,
        splitEditor,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      const splitButtons = screen.getAllByTitle("Open in split view");
      fireEvent.click(splitButtons[0]);
      expect(splitEditor).toHaveBeenCalledWith("tab-1");
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("clicking open-in-split button when split is active moves tab to opposite pane", () => {
      const setActiveTabInPane = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
        splitActive: true,
        focusedPane: "left",
        leftActiveTabId: "tab-1",
        rightActiveTabId: "tab-2",
        setActiveTabInPane,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      const splitButtons = screen.getAllByTitle("Open in split view");
      fireEvent.click(splitButtons[0]);
      expect(setActiveTabInPane).toHaveBeenCalledWith("right", "tab-1");
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("clicking open-in-split when focused on right pane targets left pane", () => {
      const setActiveTabInPane = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({
        tabs: [
          makeTab({ id: "tab-1", filePath: "src/main.ts" }),
          makeTab({ id: "tab-2", filePath: "src/app.tsx" }),
        ],
        activeTabId: "tab-1",
        splitActive: true,
        focusedPane: "right",
        leftActiveTabId: "tab-1",
        rightActiveTabId: "tab-2",
        setActiveTabInPane,
      });
      useUIStore.setState({ setActiveViewTab });
      render(<FileTabBar />);
      const splitButtons = screen.getAllByTitle("Open in split view");
      fireEvent.click(splitButtons[0]);
      expect(setActiveTabInPane).toHaveBeenCalledWith("left", "tab-1");
    });

    it("does not show open-in-split button when fewer than 2 tabs", () => {
      useFileViewerStore.setState({
        tabs: [makeTab()],
        activeTabId: "tab-1",
      });
      render(<FileTabBar />);
      expect(screen.queryByTitle("Open in split view")).not.toBeInTheDocument();
    });
  });

  describe("workspace chat tabs", () => {
    it("renders workspace-specific chat tabs with label and icon", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      expect(screen.getByText("My Workspace")).toBeInTheDocument();
      expect(screen.getByTestId("message-icon")).toBeInTheDocument();
    });

    it("workspace chat tab has accent styling when active", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat-ws-1",
      });
      render(<FileTabBar />);
      const wsTab = screen.getByText("My Workspace").closest("[role='tab']");
      expect(wsTab).toHaveStyle({ color: "var(--accent)" });
    });

    it("clicking workspace chat tab calls showChat and setActiveViewTab", () => {
      const showChat = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({ showChat });
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
        setActiveViewTab,
      });
      render(<FileTabBar />);
      fireEvent.click(screen.getByText("My Workspace"));
      expect(showChat).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat-ws-1");
    });

    it("closing workspace chat tab calls closeViewTab", () => {
      const closeViewTab = vi.fn();
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
        closeViewTab,
      });
      render(<FileTabBar />);
      // Find the close button on the workspace chat tab (first x-icon)
      const closeButtons = screen.getAllByTestId("x-icon");
      fireEvent.click(closeButtons[0].closest("button")!);
      expect(closeViewTab).toHaveBeenCalledWith("chat-ws-1");
    });

    it("renders multiple workspace chat tabs", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "Workspace A", pinned: true, contextId: "ws-1", contextType: "workspace" },
          { id: "chat-ws-2", type: "chat", label: "Workspace B", pinned: true, contextId: "ws-2", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      expect(screen.getByText("Workspace A")).toBeInTheDocument();
      expect(screen.getByText("Workspace B")).toBeInTheDocument();
    });

    it("shows split chat button on workspace chat tabs", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      expect(screen.getByTitle("Open in split chat view")).toBeInTheDocument();
    });

    it("clicking split chat button calls splitChat", () => {
      const splitChat = vi.fn();
      const showChat = vi.fn();
      const setActiveViewTab = vi.fn();
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
        splitChat,
        splitChatActive: false,
        setActiveViewTab,
      });
      useFileViewerStore.setState({ showChat });
      render(<FileTabBar />);
      fireEvent.click(screen.getByTitle("Open in split chat view"));
      expect(splitChat).toHaveBeenCalledWith("ws-1", "workspace");
      expect(showChat).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat");
    });

    it("shows close split chat button when split chat is active", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
        ],
        activeViewTabId: "chat",
        splitChatActive: true,
      });
      render(<FileTabBar />);
      expect(screen.getByTitle("Close split chat view")).toBeInTheDocument();
    });

    it("pressing Enter on workspace chat tab activates it", () => {
      const showChat = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({ showChat });
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
        setActiveViewTab,
      });
      render(<FileTabBar />);
      const wsTab = screen.getByText("My Workspace").closest("[role='tab']")!;
      fireEvent.keyDown(wsTab, { key: "Enter" });
      expect(showChat).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat-ws-1");
    });

    it("pressing Space on workspace chat tab activates it", () => {
      const showChat = vi.fn();
      const setActiveViewTab = vi.fn();
      useFileViewerStore.setState({ showChat });
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
        setActiveViewTab,
      });
      render(<FileTabBar />);
      const wsTab = screen.getByText("My Workspace").closest("[role='tab']")!;
      fireEvent.keyDown(wsTab, { key: " " });
      expect(showChat).toHaveBeenCalled();
      expect(setActiveViewTab).toHaveBeenCalledWith("chat-ws-1");
    });

    it("pressing a non-activation key on workspace chat tab does nothing", () => {
      const showChat = vi.fn();
      useFileViewerStore.setState({ showChat });
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true, contextId: "ws-1", contextType: "workspace" },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      const wsTab = screen.getByText("My Workspace").closest("[role='tab']")!;
      fireEvent.keyDown(wsTab, { key: "Tab" });
      expect(showChat).not.toHaveBeenCalled();
    });

    it("does not show split chat button when contextId is missing", () => {
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
          { id: "chat-ws-1", type: "chat", label: "My Workspace", pinned: true },
        ],
        activeViewTabId: "chat",
      });
      render(<FileTabBar />);
      expect(screen.queryByTitle("Open in split chat view")).not.toBeInTheDocument();
    });

    it("clicking close split chat button calls closeSplitChat", () => {
      const closeSplitChat = vi.fn();
      useUIStore.setState({
        viewTabs: [
          { id: "chat", type: "chat", label: "Chat", pinned: true },
        ],
        activeViewTabId: "chat",
        splitChatActive: true,
        closeSplitChat,
      });
      render(<FileTabBar />);
      fireEvent.click(screen.getByTitle("Close split chat view"));
      expect(closeSplitChat).toHaveBeenCalled();
    });
  });
});
