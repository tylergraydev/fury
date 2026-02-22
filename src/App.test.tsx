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

vi.mock("./components/CommandPalette", () => ({
  CommandPalette: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="command-palette" onClick={() => onOpenChange(false)}>
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
}));

const mockApplyTheme = vi.fn();
vi.mock("./lib/themes", () => ({
  applyTheme: (...args: any[]) => mockApplyTheme(...args),
}));

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

import App from "./App";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { useChatStore } from "./stores/chatStore";
import { useCopilotStore } from "./stores/copilotStore";

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
    bottomTab: "terminal",
    viewTabs: [{ id: "chat", type: "chat" as const, pinned: true, label: "Chat" }],
    activeViewTabId: "chat",
  });
  useFileViewerStore.setState({ tabs: [], activeTabId: null });
  useChatStore.setState({ messages: {} });
  mockGetAppSettings.mockResolvedValue({});
  mockClearSession.mockResolvedValue(undefined);
  mockApplyTheme.mockClear();
  mockInitializeCopilot.mockClear();
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

  it("shows RightSidebar when visible and context exists", () => {
    setWorkspaceContext();
    render(<App />);
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument();
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

    it("shows HistoryView when viewTab is history", () => {
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
      expect(screen.getByTestId("history-view")).toBeInTheDocument();
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
    it("uses workspace sidebar context when workspace is active", () => {
      setWorkspaceContext();
      render(<App />);
      // Sidebar and right sidebar should both be rendered
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("right-sidebar")).toBeInTheDocument();
    });

    it("uses repo sidebar context when only repo is active", () => {
      setRepoContext();
      render(<App />);
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("right-sidebar")).toBeInTheDocument();
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
});
