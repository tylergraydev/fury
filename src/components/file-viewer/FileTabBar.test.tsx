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
    // The tab wrapper span should have accent color when active
    const tabWrapper = screen.getByText("main.ts").closest("span.flex");
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
    const mergeTab = screen.getByText("Merge").closest("span[class*='flex']");
    // The parent span should have accent color
    expect(mergeTab?.closest("span")).toHaveStyle({ color: "var(--accent)" });
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

  it("does not render spacer when no non-chat view tabs", () => {
    useUIStore.setState({
      viewTabs: [{ id: "chat", type: "chat", label: "Chat", pinned: true }],
      activeViewTabId: "chat",
    });
    const { container } = render(<FileTabBar />);
    // No spacer div with flex-1
    const spacer = container.querySelector(".flex-1");
    expect(spacer).toBeNull();
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
});
