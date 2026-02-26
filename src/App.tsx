import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { FileTabBar } from "./components/file-viewer/FileTabBar";
import { FileViewerPanel } from "./components/file-viewer/FileViewerPanel";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import { MergeView, MergeViewWrapper } from "./components/merge/MergeView";
import { HistoryView } from "./components/history/HistoryView";
import { CommandPalette, type PaletteMode } from "./components/CommandPalette";
import { LandingPage } from "./components/landing/LandingPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DiffPanel } from "./components/diff/DiffPanel";
import { TeamView } from "./components/team/TeamView";
import { TestRunnerPanel } from "./components/test-runner/TestRunnerPanel";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { useKeyboardShortcuts } from "./lib/keybindings";
import { clearSession, getAppSettings } from "./lib/tauri";
import { useChatStore } from "./stores/chatStore";
import { useCopilotStore } from "./stores/copilotStore";
import { ToastContainer } from "./components/Toast";
import { UpdateBanner } from "./components/UpdateBanner";
import { useAutoUpdate } from "./lib/autoUpdate";
import { applyTheme } from "./lib/themes";
import { startIpcFlush, stopIpcFlush } from "./lib/ipcInstrumentation";
import { startFrameMonitor, stopFrameMonitor } from "./lib/frameMonitor";
import { NotificationPanel } from "./components/notifications/NotificationPanel";
import { useNotificationStore } from "./stores/notificationStore";
import { initNotificationListeners } from "./lib/notificationListeners";
import "./App.css";

export type SidebarContext =
  | { type: "workspace"; id: string }
  | { type: "repo"; id: string };

function MainPanel() {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore();
  const viewTabs = useUIStore((s) => s.viewTabs);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const activeTabId = useFileViewerStore((s) => s.activeTabId);
  const activeFileTab = fileTabs.find((t) => t.id === activeTabId) ?? null;

  const contextId = activeWorkspaceId ?? activeRepoId!;
  const contextType = activeWorkspaceId ? "workspace" : "repo";
  const activeViewTab = viewTabs.find((t) => t.id === activeViewTabId);
  const viewType = activeViewTab?.type ?? "chat";

  return (
    <div className="flex h-full flex-col">
      {viewType === "chat" && (
        <div className="flex-1 overflow-hidden">
          {activeFileTab ? (
            <FileViewerPanel tab={activeFileTab} />
          ) : (
            <ChatPanel contextId={contextId} contextType={contextType} />
          )}
        </div>
      )}
      {viewType === "merge" && (
        <div className="flex-1 overflow-hidden">
          {activeWorkspaceId ? (
            <MergeView workspaceId={activeWorkspaceId} />
          ) : (
            <MergeViewWrapper />
          )}
        </div>
      )}
      {viewType === "history" && (
        <div className="flex-1 overflow-hidden">
          <HistoryView />
        </div>
      )}
      {viewType === "diff" && (
        <div className="flex-1 overflow-hidden">
          <DiffPanel contextId={contextId} />
        </div>
      )}
      {viewType === "team" && (
        <div className="flex-1 overflow-hidden">
          <TeamView />
        </div>
      )}
      {viewType === "tests" && (
        <div className="flex-1 overflow-hidden">
          <TestRunnerPanel contextId={contextId} contextType={contextType} />
        </div>
      )}
    </div>
  );
}

function App() {
  const { activeWorkspaceId, activeRepoId, workspaces, loadWorkspaces } = useWorkspaceStore();
  const { repositories, loadRepositories } = useRepositoryStore();
  const rightSidebarVisible = useUIStore((s) => s.rightSidebarVisible);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const theme = useUIStore((s) => s.theme);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("default");
  const autoUpdate = useAutoUpdate();
  const settingsRef = useRef<{ copilotEnabled?: boolean } | null>(null);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load saved settings once on mount (single IPC call)
  useEffect(() => {
    getAppSettings()
      .then((settings) => {
        settingsRef.current = { copilotEnabled: !!settings.copilot?.enabled };
        if (settings.theme) {
          useUIStore.getState().setTheme(settings.theme);
        }
      })
      .catch((e) => console.error("Failed to load app settings:", e));
  }, []);

  // Start perf instrumentation and notification listeners
  useEffect(() => {
    startIpcFlush();
    startFrameMonitor();
    const cleanupNotifications = initNotificationListeners();
    return () => {
      stopIpcFlush();
      stopFrameMonitor();
      cleanupNotifications();
    };
  }, []);

  // Load repositories and workspaces on mount
  useEffect(() => {
    loadRepositories();
    loadWorkspaces();
  }, [loadRepositories, loadWorkspaces]);

  const hasContext = activeWorkspaceId || activeRepoId;

  // Auto-start Copilot LS when a workspace/repo is selected and copilot is enabled
  useEffect(() => {
    if (!hasContext) return;

    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
    const repo = activeWs
      ? repositories.find((r) => r.id === activeWs.repoId)
      : repositories.find((r) => activeRepoId === r.id);

    if (!repo) return;

    const rootUri = `file://${repo.path}`;
    if (settingsRef.current) {
      if (settingsRef.current.copilotEnabled) {
        useCopilotStore.getState().initialize(rootUri);
      }
    } else {
      // Settings not yet loaded — wait for them
      getAppSettings()
        .then((settings) => {
          settingsRef.current = { copilotEnabled: !!settings.copilot?.enabled };
          if (settings.copilot?.enabled) {
            useCopilotStore.getState().initialize(rootUri);
          }
        })
        .catch((e) => console.error("Failed to load Copilot settings:", e));
    }
  }, [hasContext, activeWorkspaceId, activeRepoId, workspaces, repositories]);

  const handleAction = useCallback((action: string) => {
    const ui = useUIStore.getState();
    switch (action) {
      case "toggle-palette":
        setShowPalette((v) => !v);
        break;
      case "toggle-right-sidebar":
        ui.toggleRightSidebar();
        break;
      case "focus-terminal":
        ui.setBottomTab("terminal");
        ui.ensureRightSidebarVisible();
        document.querySelector<HTMLElement>("[data-terminal-input]")?.focus();
        break;
      case "open-settings":
        ui.openViewTab("settings", true);
        break;
      case "view-chat":
        ui.setActiveViewTab("chat");
        break;
      case "view-merge":
        ui.openViewTab("merge");
        break;
      case "view-history":
        ui.openViewTab("history");
        break;
      case "right-sidebar-files":
        ui.setRightSidebarTab("files");
        ui.ensureRightSidebarVisible();
        break;
      case "right-sidebar-changes":
        ui.setRightSidebarTab("changes");
        ui.ensureRightSidebarVisible();
        break;
      case "right-sidebar-checks":
        ui.setRightSidebarTab("checks");
        ui.ensureRightSidebarVisible();
        break;
      case "toggle-notifications":
        useNotificationStore.getState().togglePanel();
        break;
      case "view-team":
        ui.openViewTab("team");
        break;
      case "view-tests":
        ui.openViewTab("tests");
        break;
      case "new-workspace":
        setShowPalette(true);
        break;
      case "search-workspaces":
        useWorkspaceStore.getState().loadArchivedWorkspaces();
        setPaletteMode("workspace-search");
        setShowPalette(true);
        break;
      case "save-file": {
        useFileViewerStore.getState().saveActiveFile();
        break;
      }
      case "new-session": {
        const wsId = useWorkspaceStore.getState().activeWorkspaceId;
        if (wsId) {
          clearSession(wsId).catch(console.error);
          useChatStore.getState().clearMessages(wsId);
        }
        break;
      }
      case "escape":
        setShowPalette(false);
        break;
    }
  }, []);

  const handlePaletteOpenChange = useCallback((open: boolean) => {
    setShowPalette(open);
    if (!open) setPaletteMode("default");
  }, []);

  useKeyboardShortcuts(handleAction);

  // Full-screen landing page when no workspace/repo is selected
  if (!hasContext) {
    const showSettingsOverlay = activeViewTabId === "settings";

    return (
      <div className="h-screen flex flex-col">
        {autoUpdate.update && (
          <UpdateBanner
            version={autoUpdate.update.version}
            installing={autoUpdate.installing}
            installed={autoUpdate.installed}
            error={autoUpdate.error}
            onInstall={autoUpdate.install}
            onDismiss={autoUpdate.dismiss}
          />
        )}
        <LandingPage onOpenSettings={() => handleAction("open-settings")} />

        {showSettingsOverlay && (
          <div
            className="fixed inset-0 z-40 overflow-y-auto"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <AppSettingsPanel />
          </div>
        )}

        {showPalette && (
          <CommandPalette
            open={showPalette}
            onOpenChange={handlePaletteOpenChange}
            onAction={handleAction}
            mode={paletteMode}
          />
        )}
      </div>
    );
  }

  // 3-panel workspace layout
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeRepo = activeWs
    ? repositories.find((r) => r.id === activeWs.repoId)
    : repositories.find((r) =>
        useWorkspaceStore.getState().activeRepoId === r.id
      );

  const sidebarContext: SidebarContext | null = activeWorkspaceId
    ? { type: "workspace", id: activeWorkspaceId }
    : activeRepoId
    ? { type: "repo", id: activeRepoId }
    : /* v8 ignore next -- @preserve */ null;

  const showRightSidebar = rightSidebarVisible && sidebarContext !== null;

  return (
    <div className="h-screen flex flex-col">
      {autoUpdate.update && (
        <UpdateBanner
          version={autoUpdate.update.version}
          installing={autoUpdate.installing}
          installed={autoUpdate.installed}
          error={autoUpdate.error}
          onInstall={autoUpdate.install}
          onDismiss={autoUpdate.dismiss}
        />
      )}
      <PanelGroup direction="horizontal" key={showRightSidebar ? "with-right" : "without-right"}>
        <Panel defaultSize={20} minSize={12} maxSize={30}>
          <ErrorBoundary label="Sidebar">
            <Sidebar />
          </ErrorBoundary>
        </Panel>
        <PanelResizeHandle className="resize-handle-h" />

        <Panel defaultSize={showRightSidebar ? 55 : 80} minSize={30}>
          <div className="flex h-full flex-col">
            <TopBar activeWs={activeWs} activeRepo={activeRepo} />
            <FileTabBar />
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary label="MainPanel" resetKey={sidebarContext?.id}>
                <MainPanel />
              </ErrorBoundary>
            </div>
          </div>
        </Panel>

        {showRightSidebar && sidebarContext && (
          <>
            <PanelResizeHandle className="resize-handle-h" />
            <Panel defaultSize={25} minSize={15} maxSize={40}>
              <ErrorBoundary label="Panel" resetKey={sidebarContext.id}>
                <RightSidebar context={sidebarContext} />
              </ErrorBoundary>
            </Panel>
          </>
        )}
      </PanelGroup>

      {activeViewTabId === "settings" && (
        <div
          className="fixed inset-0 z-40 overflow-y-auto"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <AppSettingsPanel />
        </div>
      )}

      <CommandPalette
        open={showPalette}
        onOpenChange={handlePaletteOpenChange}
        onAction={handleAction}
        mode={paletteMode}
      />

      <NotificationPanel />
      <ToastContainer />
    </div>
  );
}

export default App;
