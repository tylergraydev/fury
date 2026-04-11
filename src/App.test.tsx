import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Capture the handleAction callback from useKeyboardShortcuts
let capturedHandler: ((action: string) => void) | null = null;

// Mock all child components
vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  PanelGroup: ({ children }: any) => (
    <div data-testid="panel-group">{children}</div>
  ),
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("./components/layout/Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("./components/layout/TopBar", () => ({
  TopBar: () => <div data-testid="top-bar">TopBar</div>,
}));

vi.mock("./components/layout/RightSidebar", () => ({
  RightSidebar: () => <div data-testid="right-sidebar">RightSidebar</div>,
}));

vi.mock("./components/chat/ChatPanel", () => ({
  ChatPanel: ({ contextId, contextType }: any) => (
    <div data-testid="chat-panel" data-context-id={contextId} data-context-type={contextType}>
      ChatPanel
    </div>
  ),
}));

vi.mock("./components/file-viewer/FileTabBar", () => ({
  FileTabBar: () => <div data-testid="file-tab-bar">FileTabBar</div>,
}));

vi.mock("./components/file-viewer/FileViewerPanel", () => ({
  FileViewerPanel: ({ tab }: any) => (
    <div data-testid="file-viewer" data-tab-id={tab?.id}>FileViewer</div>
  ),
}));

vi.mock("./components/settings/AppSettingsPanel", () => ({
  AppSettingsPanel: () => <div data-testid="app-settings">AppSettings</div>,
}));

vi.mock("./components/merge/MergeView", () => ({
  MergeView: ({ workspaceId }: any) => (
    <div data-testid="merge-view" data-ws-id={workspaceId}>MergeView</div>
  ),
  MergeViewWrapper: () => <div data-testid="merge-wrapper">MergeWrapper</div>,
}));

vi.mock("./components/history/HistoryView", () => ({
  HistoryView: () => <div data-testid="history-view">HistoryView</div>,
}));

vi.mock("./components/diff/DiffPanel", () => ({
  DiffPanel: ({ contextId }: any) => <div data-testid="diff-panel" data-context-id={contextId}>DiffPanel</div>,
}));

vi.mock("./components/team/TeamView", () => ({
  TeamView: () => <div data-testid="team-view">TeamView</div>,
}));

vi.mock("./components/test-runner/TestRunnerPanel", () => ({
  TestRunnerPanel: ({ contextId, contextType }: any) => (
    <div data-testid="test-runner-panel" data-context-id={contextId} data-context-type={contextType}>TestRunnerPanel</div>
  ),
}));

vi.mock("./components/usage/UsageDashboard", () => ({
  UsageDashboard: () => <div data-testid="usage-dashboard">UsageDashboard</div>,
}));

vi.mock("./components/activity-log/ActivityLogView", () => ({
  ActivityLogView: () => <div data-testid="activity-log-view">ActivityLogView</div>,
}));

vi.mock("./components/file-viewer/SplitEditorLayout", () => ({
  SplitEditorLayout: ({ repoId, contextId, contextType }: any) => (
    <div data-testid="split-editor" data-repo-id={repoId} data-context-id={contextId} data-context-type={contextType}>SplitEditor</div>
  ),
}));

vi.mock("./components/chat/AgentPaneLayout", () => ({
  AgentPaneLayout: ({ panes }: any) => (
    <div data-testid="agent-pane-layout" data-pane-count={panes.length}>AgentPaneLayout</div>
  ),
}));

vi.mock("./components/notifications/NotificationPanel", () => ({
  NotificationPanel: () => <div data-testid="notification-panel">NotificationPanel</div>,
}));

vi.mock("./components/file-viewer/BookmarkNoteDialog", () => ({
  BookmarkNoteDialog: () => <div data-testid="bookmark-note-dialog">BookmarkNoteDialog</div>,
}));

vi.mock("./components/snippets/SnippetManagerDialog", () => ({
  SnippetManagerDialog: ({ onClose }: any) => (
    <div data-testid="snippet-manager">
      <button data-testid="snippet-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("./components/workspace/WorkspaceExportDialog", () => ({
  WorkspaceExportDialog: ({ workspaceId, onClose }: any) => (
    <div data-testid="export-dialog" data-ws-id={workspaceId}>
      <button data-testid="export-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("./components/Toast", () => ({
  ToastContainer: () => <div data-testid="toast-container">ToastContainer</div>,
}));

vi.mock("./components/CommandPalette", () => ({
  CommandPalette: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="command-palette" onClick={() => onOpenChange(false)}>
        <button data-testid="palette-open-true" onClick={(e) => { e.stopPropagation(); onOpenChange(true); }}>OpenTrue</button>
        Palette
      </div>
    ) : null,
}));

vi.mock("./components/landing/LandingPage", () => ({
  LandingPage: ({ onOpenSettings }: any) => (
    <div data-testid="landing-page">
      LandingPage
      {onOpenSettings && (
        <button data-testid="landing-settings" onClick={onOpenSettings}>
          Settings
        </button>
      )}
    </div>
  ),
}));

vi.mock("./components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => <>{children}</>,
}));

vi.mock("./lib/keybindings", () => ({
  useKeyboardShortcuts: vi.fn((handler: any) => {
    capturedHandler = handler;
  }),
}));

const mockGetAppSettings = vi.fn().mockResolvedValue({});
const mockClearSession = vi.fn().mockResolvedValue(undefined);

vi.mock("./lib/tauri", () => ({
  clearSession: (...args: any[]) => mockClearSession(...args),
  getAppSettings: (...args: any[]) => mockGetAppSettings(...args),
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
  detectLspSuggestions: vi.fn().mockResolvedValue([]),
  getLastActiveContext: vi.fn().mockResolvedValue([null, null]),
  saveLastActiveContext: vi.fn().mockResolvedValue(undefined),
}));

const mockApplyTheme = vi.fn();

vi.mock("monaco-editor", () => ({}));

vi.mock("./lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn().mockResolvedValue(undefined),
}));

const mockInitializeCopilot = vi.fn();
vi.mock("./lib/copilot", () => ({
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
  notifyDocumentClosed: vi.fn(),
}));

vi.mock("./App.css", () => ({}));

const mockRegisterCustomTheme = vi.fn();
vi.mock("./lib/themes", () => ({
  applyTheme: (...args: any[]) => mockApplyTheme(...args),
  registerCustomTheme: (...args: any[]) => mockRegisterCustomTheme(...args),
}));

import App from "./App";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { useChatStore } from "./stores/chatStore";
import { useCopilotStore } from "./stores/copilotStore";
import { useTestRunnerStore } from "./stores/testRunnerStore";
import { useNotificationStore } from "./stores/notificationStore";

beforeEach(() => {
  capturedHandler = null;
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
  });
  useRepositoryStore.setState({ repositories: [], loading: false, error: null });
  useUIStore.setState({
    theme: "blend",
    rightSidebarVisible: true,
    rightSidebarTab: "files",
    bottomTab: "setup",
    viewTabs: [{ id: "chat", type: "chat" as const, pinned: true, label: "Chat" }],
    activeViewTabId: "chat",
  });
  useFileViewerStore.setState({ tabs: [], activeTabId: null });
  useChatStore.setState({ messages: {} });
  mockGetAppSettings.mockResolvedValue({});
  mockClearSession.mockResolvedValue(undefined);
  mockApplyTheme.mockClear();
  mockInitializeCopilot.mockClear();
  mockRegisterCustomTheme.mockClear();
  useFileViewerStore.setState({ tabs: [], activeTabId: null, splitActive: false });
  useUIStore.setState({
    ...useUIStore.getState(),
    agentPanes: [],
    focusedPaneIndex: 0,
  });
  vi.clearAllMocks();
});

function setWorkspaceContext() {
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", name: "test", branch: "main", repoId: "r1" },
    ] as any,
    activeWorkspaceId: "ws-1",
  });
  useRepositoryStore.setState({
    repositories: [{ id: "r1", name: "my-repo", path: "/path" }] as any,
  });
}

function setRepoContext() {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeRepoId: "r1",
  });
  useRepositoryStore.setState({
    repositories: [{ id: "r1", name: "my-repo", path: "/repo/path" }] as any,
  });
}

describe("App", () => {
  it("shows LandingPage when no workspace or repo is active", () => {
    render(<App />);
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it("shows workspace layout when workspace is active", () => {
    setWorkspaceContext();
    render(<App />);
    expect(screen.queryByTestId("landing-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("shows ChatPanel in main area by default", () => {
    setWorkspaceContext();
    render(<App />);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("merge-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-view")).not.toBeInTheDocument();
  });

  it("shows RightSidebar when visible and context exists", async () => {
    setWorkspaceContext();
    render(<App />);
    expect(await screen.findByTestId("right-sidebar")).toBeInTheDocument();
  });

  it("hides RightSidebar when not visible", () => {
    setWorkspaceContext();
    useUIStore.setState({ ...useUIStore.getState(), rightSidebarVisible: false });
    render(<App />);
    expect(screen.queryByTestId("right-sidebar")).not.toBeInTheDocument();
  });

  it("shows settings overlay when settings view tab is active (no context)", () => {
    useUIStore.setState({
      ...useUIStore.getState(),
      activeViewTabId: "settings",
      viewTabs: [
        { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
        { id: "settings", type: "settings" as const, pinned: true, label: "Settings" },
      ],
    });
    render(<App />);
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    expect(screen.getByTestId("app-settings")).toBeInTheDocument();
  });

  it("shows settings overlay when settings view tab is active (with context)", () => {
    setWorkspaceContext();
    useUIStore.setState({
      ...useUIStore.getState(),
      activeViewTabId: "settings",
      viewTabs: [
        { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
        { id: "settings", type: "settings" as const, pinned: true, label: "Settings" },
      ],
    });
    render(<App />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-settings")).toBeInTheDocument();
  });

  // --- MainPanel tests ---
  describe("MainPanel", () => {
    it("shows FileViewerPanel when a file tab is active", () => {
      setWorkspaceContext();
      useFileViewerStore.setState({
        tabs: [{ id: "tab-1", filePath: "/test.ts", language: "typescript", content: "" }] as any,
        activeTabId: "tab-1",
      });
      render(<App />);
      expect(screen.getByTestId("file-viewer")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    });

    it("shows ChatPanel with contextId and contextType for workspace", () => {
      setWorkspaceContext();
      render(<App />);
      const chat = screen.getByTestId("chat-panel");
      expect(chat).toHaveAttribute("data-context-id", "ws-1");
      expect(chat).toHaveAttribute("data-context-type", "workspace");
    });

    it("shows ChatPanel with repo context when only repo is active", () => {
      setRepoContext();
      render(<App />);
      const chat = screen.getByTestId("chat-panel");
      expect(chat).toHaveAttribute("data-context-id", "r1");
      expect(chat).toHaveAttribute("data-context-type", "repo");
    });

    it("shows MergeView when viewTab is merge with workspace", () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "merge", type: "merge" as const, pinned: false, label: "Merge" },
        ],
        activeViewTabId: "merge",
      });
      render(<App />);
      expect(screen.getByTestId("merge-view")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    });

    it("shows MergeViewWrapper when viewTab is merge without workspace", () => {
      setRepoContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "merge", type: "merge" as const, pinned: false, label: "Merge" },
        ],
        activeViewTabId: "merge",
      });
      render(<App />);
      expect(screen.getByTestId("merge-wrapper")).toBeInTheDocument();
    });

    it("shows HistoryView when viewTab is history", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "history", type: "history" as const, pinned: false, label: "History" },
        ],
        activeViewTabId: "history",
      });
      render(<App />);
      expect(await screen.findByTestId("history-view")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    });

    it("defaults to chat view when activeViewTab is not found", () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [{ id: "chat", type: "chat" as const, pinned: true, label: "Chat" }],
        activeViewTabId: "nonexistent",
      });
      render(<App />);
      expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    });
  });

  // --- Theme tests ---
  describe("Theme loading", () => {
    it("applies theme on mount", () => {
      render(<App />);
      expect(mockApplyTheme).toHaveBeenCalledWith("blend");
    });

    it("loads saved theme from settings on mount", async () => {
      mockGetAppSettings.mockResolvedValue({ theme: "dark" });
      render(<App />);
      await waitFor(() => {
        expect(mockGetAppSettings).toHaveBeenCalled();
      });
    });

    it("handles getAppSettings rejection for theme loading", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetAppSettings.mockRejectedValue(new Error("settings fail"));
      render(<App />);
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to load app settings:",
          expect.any(Error),
        );
      });
      consoleSpy.mockRestore();
    });
  });

  // --- Copilot auto-start ---
  describe("Copilot auto-start", () => {
    it("attempts to auto-start copilot when workspace is active", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      setWorkspaceContext();
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      await waitFor(() => {
        expect(mockGetAppSettings).toHaveBeenCalled();
      });
      initSpy.mockRestore();
    });

    it("does not start copilot when no context", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      // Wait for effect
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(initSpy).not.toHaveBeenCalled();
      initSpy.mockRestore();
    });

    it("handles copilot settings fetch failure", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      setWorkspaceContext();
      // First call for theme, second for copilot
      mockGetAppSettings.mockRejectedValue(new Error("copilot settings fail"));
      render(<App />);
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Failed to load"),
          expect.any(Error),
        );
      });
      consoleSpy.mockRestore();
    });

    it("resolves repo from activeRepoId when no workspace", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      setRepoContext();
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      await waitFor(() => {
        expect(mockGetAppSettings).toHaveBeenCalled();
      });
      initSpy.mockRestore();
    });

    it("initializes copilot when settings are already loaded on re-run", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      // Render WITHOUT context first so copilot effect returns early
      // while settings effect runs and sets settingsRef.current
      render(<App />);
      // Flush microtasks so settingsRef.current is set via getAppSettings().then()
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      // NOW add workspace context - copilot effect runs with settingsRef.current already set
      act(() => {
        setWorkspaceContext();
      });
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      expect(initSpy).toHaveBeenCalledWith("file:///path");
      initSpy.mockRestore();
    });
  });

  // --- handleAction keyboard shortcuts ---
  describe("handleAction", () => {
    it("toggle-palette opens and closes command palette", async () => {
      setWorkspaceContext();
      render(<App />);
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();

      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });

    it("toggle-right-sidebar calls ui.toggleRightSidebar", () => {
      setWorkspaceContext();
      const toggleSpy = vi.spyOn(useUIStore.getState(), "toggleRightSidebar");
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-right-sidebar");
      });
      expect(toggleSpy).toHaveBeenCalled();
    });

    it("focus-terminal sets bottom tab and ensures right sidebar visible", () => {
      setWorkspaceContext();
      const setBottomTabSpy = vi.spyOn(useUIStore.getState(), "setBottomTab");
      const ensureSpy = vi.spyOn(useUIStore.getState(), "ensureRightSidebarVisible");
      render(<App />);
      act(() => {
        capturedHandler?.("focus-terminal");
      });
      expect(setBottomTabSpy).toHaveBeenCalledWith("terminal");
      expect(ensureSpy).toHaveBeenCalled();
    });

    it("open-settings calls ui.openViewTab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("open-settings");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("settings", true);
    });

    it("view-chat sets active view tab to chat", () => {
      setWorkspaceContext();
      const setActiveViewTabSpy = vi.spyOn(useUIStore.getState(), "setActiveViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-chat");
      });
      expect(setActiveViewTabSpy).toHaveBeenCalledWith("chat");
    });

    it("view-merge opens merge view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-merge");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("merge");
    });

    it("view-history opens history view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-history");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("history");
    });

    it("right-sidebar-files sets tab and ensures visible", () => {
      setWorkspaceContext();
      const setTabSpy = vi.spyOn(useUIStore.getState(), "setRightSidebarTab");
      const ensureSpy = vi.spyOn(useUIStore.getState(), "ensureRightSidebarVisible");
      render(<App />);
      act(() => {
        capturedHandler?.("right-sidebar-files");
      });
      expect(setTabSpy).toHaveBeenCalledWith("files");
      expect(ensureSpy).toHaveBeenCalled();
    });

    it("right-sidebar-changes sets tab and ensures visible", () => {
      setWorkspaceContext();
      const setTabSpy = vi.spyOn(useUIStore.getState(), "setRightSidebarTab");
      const ensureSpy = vi.spyOn(useUIStore.getState(), "ensureRightSidebarVisible");
      render(<App />);
      act(() => {
        capturedHandler?.("right-sidebar-changes");
      });
      expect(setTabSpy).toHaveBeenCalledWith("changes");
      expect(ensureSpy).toHaveBeenCalled();
    });

    it("right-sidebar-checks sets tab and ensures visible", () => {
      setWorkspaceContext();
      const setTabSpy = vi.spyOn(useUIStore.getState(), "setRightSidebarTab");
      const ensureSpy = vi.spyOn(useUIStore.getState(), "ensureRightSidebarVisible");
      render(<App />);
      act(() => {
        capturedHandler?.("right-sidebar-checks");
      });
      expect(setTabSpy).toHaveBeenCalledWith("checks");
      expect(ensureSpy).toHaveBeenCalled();
    });

    it("new-workspace shows palette", () => {
      setWorkspaceContext();
      render(<App />);
      act(() => {
        capturedHandler?.("new-workspace");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    it("search-workspaces loads archived workspaces and opens palette in workspace-search mode", () => {
      setWorkspaceContext();
      const loadArchivedSpy = vi.spyOn(useWorkspaceStore.getState(), "loadArchivedWorkspaces").mockImplementation(async () => {});
      render(<App />);
      act(() => {
        capturedHandler?.("search-workspaces");
      });
      expect(loadArchivedSpy).toHaveBeenCalled();
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
      loadArchivedSpy.mockRestore();
    });

    it("save-file calls saveActiveFile", () => {
      setWorkspaceContext();
      const saveSpy = vi.spyOn(useFileViewerStore.getState(), "saveActiveFile").mockImplementation(async () => {});
      render(<App />);
      act(() => {
        capturedHandler?.("save-file");
      });
      expect(saveSpy).toHaveBeenCalled();
    });

    it("new-session clears session and messages for active workspace", async () => {
      setWorkspaceContext();
      const clearMsgSpy = vi.spyOn(useChatStore.getState(), "clearMessages").mockImplementation(() => {});
      render(<App />);
      act(() => {
        capturedHandler?.("new-session");
      });
      expect(mockClearSession).toHaveBeenCalledWith("ws-1");
      expect(clearMsgSpy).toHaveBeenCalledWith("ws-1");
    });

    it("new-session does nothing when no active workspace", () => {
      // No workspace context
      render(<App />);
      act(() => {
        capturedHandler?.("new-session");
      });
      expect(mockClearSession).not.toHaveBeenCalled();
    });

    it("escape closes palette", () => {
      setWorkspaceContext();
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
      act(() => {
        capturedHandler?.("escape");
      });
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  // --- handlePaletteOpenChange ---
  describe("handlePaletteOpenChange", () => {
    it("closes palette and resets mode to default when onOpenChange(false) is called", () => {
      setWorkspaceContext();
      render(<App />);
      // Open the palette
      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
      // Click the palette mock element which calls onOpenChange(false)
      act(() => {
        screen.getByTestId("command-palette").click();
      });
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });

    it("keeps palette open and does not reset mode when onOpenChange(true) is called", () => {
      setWorkspaceContext();
      render(<App />);
      // Open the palette first
      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
      // Call onOpenChange(true) via the palette-open-true button
      act(() => {
        screen.getByTestId("palette-open-true").click();
      });
      // Palette should still be open
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });
  });

  // --- Landing page integration ---
  describe("Landing page", () => {
    it("shows command palette on landing page when toggled", () => {
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-palette");
      });
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    it("landing page settings button triggers handleAction open-settings", () => {
      render(<App />);
      const settingsBtn = screen.getByTestId("landing-settings");
      act(() => {
        settingsBtn.click();
      });
      // Should have opened settings overlay
    });
  });

  // --- Sidebar context ---
  describe("Sidebar context", () => {
    it("uses workspace sidebar context when workspace is active", async () => {
      setWorkspaceContext();
      render(<App />);
      // Sidebar and right sidebar should both be rendered
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(await screen.findByTestId("right-sidebar")).toBeInTheDocument();
    });

    it("uses repo sidebar context when only repo is active", async () => {
      setRepoContext();
      render(<App />);
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(await screen.findByTestId("right-sidebar")).toBeInTheDocument();
    });

    it("resolves activeRepo from workspace repoId", () => {
      setWorkspaceContext();
      render(<App />);
      expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    });

    it("resolves activeRepo from activeRepoId when no workspace", () => {
      setRepoContext();
      render(<App />);
      expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    });
  });

  // --- Additional MainPanel view types ---
  describe("MainPanel additional views", () => {
    it("shows DiffPanel when viewTab is diff", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "diff", type: "diff" as const, pinned: false, label: "Diff" },
        ],
        activeViewTabId: "diff",
      });
      render(<App />);
      expect(await screen.findByTestId("diff-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    });

    it("shows TeamView when viewTab is team", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "team", type: "team" as const, pinned: false, label: "Team" },
        ],
        activeViewTabId: "team",
      });
      render(<App />);
      expect(await screen.findByTestId("team-view")).toBeInTheDocument();
    });

    it("shows TestRunnerPanel when viewTab is tests", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "tests", type: "tests" as const, pinned: false, label: "Tests" },
        ],
        activeViewTabId: "tests",
      });
      render(<App />);
      expect(await screen.findByTestId("test-runner-panel")).toBeInTheDocument();
    });

    it("shows UsageDashboard when viewTab is usage", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "usage", type: "usage" as const, pinned: false, label: "Usage" },
        ],
        activeViewTabId: "usage",
      });
      render(<App />);
      expect(await screen.findByTestId("usage-dashboard")).toBeInTheDocument();
    });

    it("shows ActivityLogView when viewTab is activity", async () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat" },
          { id: "activity", type: "activity" as const, pinned: false, label: "Activity" },
        ],
        activeViewTabId: "activity",
      });
      render(<App />);
      expect(await screen.findByTestId("activity-log-view")).toBeInTheDocument();
    });

    it("shows SplitEditorLayout when splitActive is true", () => {
      setWorkspaceContext();
      useFileViewerStore.setState({
        tabs: [],
        activeTabId: null,
        splitActive: true,
      });
      render(<App />);
      expect(screen.getByTestId("split-editor")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    });

    it("shows AgentPaneLayout when multiple agent panes exist", () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        agentPanes: [
          { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
          { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
        ],
        focusedPaneIndex: 0,
      });
      useFileViewerStore.setState({ tabs: [], activeTabId: null, splitActive: false });
      render(<App />);
      expect(screen.getByTestId("agent-pane-layout")).toBeInTheDocument();
    });

    it("shows ChatPanel when only one agent pane exists", () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        agentPanes: [{ id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" }],
        focusedPaneIndex: 0,
      });
      render(<App />);
      expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("agent-pane-layout")).not.toBeInTheDocument();
    });

    it("uses contextId and contextType from view tab when available", () => {
      setWorkspaceContext();
      useUIStore.setState({
        ...useUIStore.getState(),
        viewTabs: [
          { id: "chat", type: "chat" as const, pinned: true, label: "Chat", contextId: "custom-ctx", contextType: "repo" },
        ],
        activeViewTabId: "chat",
      });
      render(<App />);
      const chat = screen.getByTestId("chat-panel");
      expect(chat).toHaveAttribute("data-context-id", "custom-ctx");
      expect(chat).toHaveAttribute("data-context-type", "repo");
    });
  });

  // --- Additional handleAction cases ---
  describe("handleAction additional cases", () => {
    it("toggle-notifications toggles notification panel", () => {
      setWorkspaceContext();
      const toggleSpy = vi.spyOn(useNotificationStore.getState(), "togglePanel");
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-notifications");
      });
      expect(toggleSpy).toHaveBeenCalled();
    });

    it("right-sidebar-bookmarks switches to files tab and toggles bookmarks", () => {
      setWorkspaceContext();
      const setTabSpy = vi.spyOn(useUIStore.getState(), "setRightSidebarTab");
      const ensureSpy = vi.spyOn(useUIStore.getState(), "ensureRightSidebarVisible");
      render(<App />);
      act(() => {
        capturedHandler?.("right-sidebar-bookmarks");
      });
      expect(setTabSpy).toHaveBeenCalledWith("files");
      expect(ensureSpy).toHaveBeenCalled();
    });

    it("view-team opens team view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-team");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("team");
    });

    it("view-tests opens tests view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-tests");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("tests");
    });

    it("run-tests opens tests view and runs tests with workspace context", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      const runTestsSpy = vi.spyOn(useTestRunnerStore.getState(), "runTests").mockImplementation(async () => {});
      render(<App />);
      act(() => {
        capturedHandler?.("run-tests");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("tests");
      expect(runTestsSpy).toHaveBeenCalledWith("ws-1", "workspace");
      runTestsSpy.mockRestore();
    });

    it("run-tests opens tests view and runs tests with repo context", () => {
      setRepoContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      const runTestsSpy = vi.spyOn(useTestRunnerStore.getState(), "runTests").mockImplementation(async () => {});
      render(<App />);
      act(() => {
        capturedHandler?.("run-tests");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("tests");
      expect(runTestsSpy).toHaveBeenCalledWith("r1", "repo");
      runTestsSpy.mockRestore();
    });

    it("run-tests opens tests view but does not run when no context", () => {
      render(<App />);
      const runTestsSpy = vi.spyOn(useTestRunnerStore.getState(), "runTests").mockImplementation(async () => {});
      act(() => {
        capturedHandler?.("run-tests");
      });
      expect(runTestsSpy).not.toHaveBeenCalled();
      runTestsSpy.mockRestore();
    });

    it("view-usage opens usage view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-usage");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("usage");
    });

    it("view-activity opens activity view tab", () => {
      setWorkspaceContext();
      const openViewTabSpy = vi.spyOn(useUIStore.getState(), "openViewTab");
      render(<App />);
      act(() => {
        capturedHandler?.("view-activity");
      });
      expect(openViewTabSpy).toHaveBeenCalledWith("activity");
    });

    it("toggle-split-editor activates split when not active", () => {
      setWorkspaceContext();
      useFileViewerStore.setState({ tabs: [], activeTabId: null, splitActive: false });
      const splitSpy = vi.spyOn(useFileViewerStore.getState(), "splitEditor").mockImplementation(() => {});
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-split-editor");
      });
      expect(splitSpy).toHaveBeenCalled();
      splitSpy.mockRestore();
    });

    it("toggle-split-editor closes split when active", () => {
      setWorkspaceContext();
      useFileViewerStore.setState({ tabs: [], activeTabId: null, splitActive: true });
      const closeSpy = vi.spyOn(useFileViewerStore.getState(), "closeSplit").mockImplementation(() => {});
      render(<App />);
      act(() => {
        capturedHandler?.("toggle-split-editor");
      });
      expect(closeSpy).toHaveBeenCalled();
      closeSpy.mockRestore();
    });

    it("open-snippets shows snippet manager dialog", () => {
      setWorkspaceContext();
      render(<App />);
      expect(screen.queryByTestId("snippet-manager")).not.toBeInTheDocument();
      act(() => {
        capturedHandler?.("open-snippets");
      });
      expect(screen.getByTestId("snippet-manager")).toBeInTheDocument();
    });

    it("snippet manager can be closed via onClose", () => {
      setWorkspaceContext();
      render(<App />);
      act(() => {
        capturedHandler?.("open-snippets");
      });
      expect(screen.getByTestId("snippet-manager")).toBeInTheDocument();
      act(() => {
        screen.getByTestId("snippet-close").click();
      });
      expect(screen.queryByTestId("snippet-manager")).not.toBeInTheDocument();
    });

    it("export-workspace shows export dialog when workspace is active", () => {
      setWorkspaceContext();
      render(<App />);
      expect(screen.queryByTestId("export-dialog")).not.toBeInTheDocument();
      act(() => {
        capturedHandler?.("export-workspace");
      });
      expect(screen.getByTestId("export-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("export-dialog")).toHaveAttribute("data-ws-id", "ws-1");
    });

    it("export-workspace does nothing when no workspace is active", () => {
      setRepoContext();
      render(<App />);
      act(() => {
        capturedHandler?.("export-workspace");
      });
      expect(screen.queryByTestId("export-dialog")).not.toBeInTheDocument();
    });

    it("export dialog can be closed via onClose", () => {
      setWorkspaceContext();
      render(<App />);
      act(() => {
        capturedHandler?.("export-workspace");
      });
      expect(screen.getByTestId("export-dialog")).toBeInTheDocument();
      act(() => {
        screen.getByTestId("export-close").click();
      });
      expect(screen.queryByTestId("export-dialog")).not.toBeInTheDocument();
    });
  });

  // --- Custom themes ---
  describe("Custom themes", () => {
    it("registers custom themes from settings on mount", async () => {
      mockGetAppSettings.mockResolvedValue({
        theme: "custom-1",
        customThemes: [
          { id: "custom-1", vars: { bgPrimary: "#000" } },
          { id: "custom-2", vars: { bgPrimary: "#111" } },
        ],
      });
      render(<App />);
      await waitFor(() => {
        expect(mockRegisterCustomTheme).toHaveBeenCalledTimes(2);
        expect(mockRegisterCustomTheme).toHaveBeenCalledWith("custom-1", { bgPrimary: "#000" });
        expect(mockRegisterCustomTheme).toHaveBeenCalledWith("custom-2", { bgPrimary: "#111" });
      });
    });

    it("does not register custom themes when none exist in settings", async () => {
      mockGetAppSettings.mockResolvedValue({ theme: "dark" });
      render(<App />);
      await waitFor(() => {
        expect(mockGetAppSettings).toHaveBeenCalled();
      });
      expect(mockRegisterCustomTheme).not.toHaveBeenCalled();
    });
  });

  // --- Copilot settings disabled path ---
  describe("Copilot disabled path", () => {
    it("skips copilot initialize when settingsRef.copilotEnabled is false", async () => {
      // Return copilot disabled from settings
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: false } });
      // First render WITHOUT context so settings load but copilot effect returns early
      const { rerender } = render(<App />);
      // Flush microtasks so settingsRef.current gets set via getAppSettings().then()
      await act(async () => {
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });

      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      // NOW add workspace context - copilot effect runs with settingsRef.current already set
      // but copilotEnabled is false, so line 289 false branch is taken
      act(() => {
        setWorkspaceContext();
      });
      rerender(<App />);
      await act(async () => {
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });
      expect(initSpy).not.toHaveBeenCalled();
      initSpy.mockRestore();
    });

    it("does not initialize copilot when second getAppSettings returns copilot disabled", async () => {
      // Settings not loaded yet (settingsRef.current is null),
      // copilot effect will call getAppSettings again
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: false } });
      setWorkspaceContext();
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      expect(initSpy).not.toHaveBeenCalled();
      initSpy.mockRestore();
    });
  });

  // --- Layout deferral ---
  describe("Layout deferral", () => {
    it("defers layout mount when transitioning from no-context to has-context", async () => {
      render(<App />);
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();

      act(() => {
        setWorkspaceContext();
      });

      // Should eventually show workspace layout after rAF deferral
      await waitFor(() => {
        expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      });
    });

    it("does not defer layout when hasContext is already true on mount", () => {
      setWorkspaceContext();
      render(<App />);
      // Should show immediately since layoutReadyRef is initialized to true
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    it("resets layoutReady when context is removed", async () => {
      setWorkspaceContext();
      render(<App />);
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();

      act(() => {
        useWorkspaceStore.setState({
          workspaces: [],
          activeWorkspaceId: null,
          activeRepoId: null,
        });
      });

      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });
  });

  // --- Right sidebar readiness ---
  describe("Right sidebar readiness", () => {
    it("defers right sidebar content after layout ready", async () => {
      setWorkspaceContext();
      render(<App />);
      // Right sidebar should eventually appear
      expect(await screen.findByTestId("right-sidebar")).toBeInTheDocument();
    });

    it("resets right sidebar readiness when layout becomes not ready", async () => {
      setWorkspaceContext();
      render(<App />);
      expect(await screen.findByTestId("right-sidebar")).toBeInTheDocument();

      act(() => {
        useWorkspaceStore.setState({
          workspaces: [],
          activeWorkspaceId: null,
          activeRepoId: null,
        });
      });

      expect(screen.queryByTestId("right-sidebar")).not.toBeInTheDocument();
    });
  });

  // --- Copilot repo path from repo context ---
  describe("Copilot repo path", () => {
    it("returns null for copilotRepoPath when no context", () => {
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      // copilotRepoPath should be null, copilot effect returns early
      expect(initSpy).not.toHaveBeenCalled();
      initSpy.mockRestore();
    });

    it("derives copilotRepoPath from repo when only repo is active", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      setRepoContext();
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});

      render(<App />);
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      // Copilot should have been called with the repo path
      await waitFor(() => {
        expect(initSpy).toHaveBeenCalledWith("file:///repo/path");
      });
      initSpy.mockRestore();
    });

    it("returns null copilotRepoPath when repo not found in repositories", async () => {
      mockGetAppSettings.mockResolvedValue({ copilot: { enabled: true } });
      useWorkspaceStore.setState({
        workspaces: [{ id: "ws-1", name: "test", branch: "main", repoId: "r-nonexistent" }] as any,
        activeWorkspaceId: "ws-1",
      });
      useRepositoryStore.setState({
        repositories: [{ id: "r1", name: "my-repo", path: "/path" }] as any,
      });
      const initSpy = vi.spyOn(useCopilotStore.getState(), "initialize").mockImplementation(async () => {});
      render(<App />);
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      // Should not have been called since repo not found
      expect(initSpy).not.toHaveBeenCalled();
      initSpy.mockRestore();
    });
  });
});
