import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { FileTabBar } from "./components/file-viewer/FileTabBar";
import { FileViewerPanel } from "./components/file-viewer/FileViewerPanel";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import { MergeView, MergeViewWrapper } from "./components/merge/MergeView";
import { CommandPalette, type PaletteMode } from "./components/CommandPalette";
import { LandingPage } from "./components/landing/LandingPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SplitEditorLayout } from "./components/file-viewer/SplitEditorLayout";
import { SplitChatLayout } from "./components/chat/SplitChatLayout";

// Lazy-loaded view tabs — only fetched when the user navigates to them
const HistoryView = lazy(() => import("./components/history/HistoryView").then((m) => ({ default: m.HistoryView })));
const DiffPanel = lazy(() => import("./components/diff/DiffPanel").then((m) => ({ default: m.DiffPanel })));
const TeamView = lazy(() => import("./components/team/TeamView").then((m) => ({ default: m.TeamView })));
const TestRunnerPanel = lazy(() => import("./components/test-runner/TestRunnerPanel").then((m) => ({ default: m.TestRunnerPanel })));
const UsageDashboard = lazy(() => import("./components/usage/UsageDashboard").then((m) => ({ default: m.UsageDashboard })));
const ActivityLogView = lazy(() => import("./components/activity-log/ActivityLogView").then((m) => ({ default: m.ActivityLogView })));
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { useTestRunnerStore } from "./stores/testRunnerStore";
import { useKeyboardShortcuts } from "./lib/keybindings";
import { clearSession, getAppSettings } from "./lib/tauri";
import { useChatStore } from "./stores/chatStore";
import { useCopilotStore } from "./stores/copilotStore";
import { ToastContainer } from "./components/Toast";
import { applyTheme, registerCustomTheme, type ThemeVars } from "./lib/themes";
import { startIpcFlush, stopIpcFlush } from "./lib/ipcInstrumentation";
import { startFrameMonitor, stopFrameMonitor } from "./lib/frameMonitor";
import { NotificationPanel } from "./components/notifications/NotificationPanel";
import { BookmarkNoteDialog } from "./components/file-viewer/BookmarkNoteDialog";
import { SnippetManagerDialog } from "./components/snippets/SnippetManagerDialog";
import { WorkspaceExportDialog } from "./components/workspace/WorkspaceExportDialog";
import { useNotificationStore } from "./stores/notificationStore";
import { initNotificationListeners } from "./lib/notificationListeners";
import { initActivityLogListeners } from "./lib/activityLogListeners";
import { initLspSuggestionListener } from "./lib/lspSuggestionListener";
import "./App.css";

export type SidebarContext =
  | { type: "workspace"; id: string }
  | { type: "repo"; id: string };

function ViewLoadingFallback() {
  return <div className="flex h-full items-center justify-center opacity-50">Loading…</div>;
}

function MainPanel() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeRepoId = useWorkspaceStore((s) => s.activeRepoId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const viewTabs = useUIStore((s) => s.viewTabs);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const activeTabId = useFileViewerStore((s) => s.activeTabId);
  const activeFileTab = fileTabs.find((t) => t.id === activeTabId) ?? null;
  const splitActive = useFileViewerStore((s) => s.splitActive);

  const splitChatActive = useUIStore((s) => s.splitChatActive);
  const splitChatContextId = useUIStore((s) => s.splitChatContextId);
  const splitChatContextType = useUIStore((s) => s.splitChatContextType);

  const activeViewTab = viewTabs.find((t) => t.id === activeViewTabId);
  const viewType = activeViewTab?.type ?? "chat";

  const contextId = activeViewTab?.contextId ?? activeWorkspaceId ?? activeRepoId!;
  const contextType = activeViewTab?.contextType ?? (activeWorkspaceId ? "workspace" : "repo");

  const activeWs = workspaces.find((w) => w.id === (activeViewTab?.contextId ?? activeWorkspaceId));
  const repoId = activeWs?.repoId ?? activeRepoId ?? null;

  return (
    <div className="flex h-full flex-col">
      {viewType === "chat" && (
        <div className="flex-1 overflow-hidden">
          {splitActive ? (
            <SplitEditorLayout repoId={repoId} contextId={contextId} contextType={contextType} />
          ) : activeFileTab ? (
            <FileViewerPanel tab={activeFileTab} repoId={repoId} />
          ) : splitChatActive && splitChatContextId && splitChatContextType ? (
            <SplitChatLayout
              leftContextId={contextId}
              leftContextType={contextType}
              rightContextId={splitChatContextId}
              rightContextType={splitChatContextType}
            />
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
          <Suspense fallback={<ViewLoadingFallback />}>
            <HistoryView />
          </Suspense>
        </div>
      )}
      {viewType === "diff" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            <DiffPanel contextId={contextId} />
          </Suspense>
        </div>
      )}
      {viewType === "team" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            <TeamView />
          </Suspense>
        </div>
      )}
      {viewType === "tests" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            <TestRunnerPanel contextId={contextId} contextType={contextType} />
          </Suspense>
        </div>
      )}
      {viewType === "usage" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            <UsageDashboard />
          </Suspense>
        </div>
      )}
      {viewType === "activity" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            <ActivityLogView />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function App() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeRepoId = useWorkspaceStore((s) => s.activeRepoId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const repositories = useRepositoryStore((s) => s.repositories);
  const loadRepositories = useRepositoryStore((s) => s.loadRepositories);
  const rightSidebarVisible = useUIStore((s) => s.rightSidebarVisible);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const theme = useUIStore((s) => s.theme);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("default");
  const [showSnippets, setShowSnippets] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
        // Register custom themes before applying
        if (settings.customThemes) {
          for (const ct of settings.customThemes) {
            registerCustomTheme(ct.id, ct.vars as unknown as ThemeVars);
          }
        }
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
    const cleanupActivityLog = initActivityLogListeners();
    const cleanupLspSuggestions = initLspSuggestionListener();
    return () => {
      stopIpcFlush();
      stopFrameMonitor();
      cleanupNotifications();
      cleanupActivityLog();
      cleanupLspSuggestions();
    };
  }, []);

  // Load repositories and workspaces on mount
  useEffect(() => {
    loadRepositories();
    loadWorkspaces();
  }, [loadRepositories, loadWorkspaces]);

  const hasContext = activeWorkspaceId || activeRepoId;

  // Defer the workspace layout mount so the browser gets a paint frame
  // before mounting the heavy 3-panel layout and all its children.
  const [layoutReady, setLayoutReady] = useState(!!hasContext);
  const layoutReadyRef = useRef(!!hasContext);
  useEffect(() => {
    if (!hasContext) {
      setLayoutReady(false);
      layoutReadyRef.current = false;
      return;
    }
    // Already laid out (workspace-to-workspace switch) — no deferral needed
    if (layoutReadyRef.current) return;

    // Transitioning from no-context to has-context: defer heavy mount by 2 frames.
    // Use a setTimeout fallback because rAF can stall when the window lacks focus.
    let cancelled = false;
    const ready = () => {
      if (!cancelled) {
        cancelled = true;
        layoutReadyRef.current = true;
        setLayoutReady(true);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(ready));
    const timeout = setTimeout(ready, 100);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [hasContext]);

  // Stage 2: defer the RightSidebar content by one more frame after the
  // main layout has mounted (Sidebar + MainPanel render first).
  const [rightSidebarReady, setRightSidebarReady] = useState(false);
  useEffect(() => {
    if (!layoutReady) {
      setRightSidebarReady(false);
      return;
    }
    let done = false;
    const mark = () => {
      if (!done) {
        done = true;
        setRightSidebarReady(true);
      }
    };
    const id = requestAnimationFrame(mark);
    const timeout = setTimeout(mark, 100);
    return () => {
      done = true;
      cancelAnimationFrame(id);
      clearTimeout(timeout);
      setRightSidebarReady(false);
    };
  }, [layoutReady]);

  // Derive the repo path that Copilot needs — stable unless the active context actually changes.
  const copilotRepoPath = useMemo(() => {
    if (!hasContext) return null;
    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
    const repo = activeWs
      ? repositories.find((r) => r.id === activeWs.repoId)
      : repositories.find((r) => activeRepoId === r.id);
    return repo?.path ?? null;
  }, [hasContext, activeWorkspaceId, activeRepoId, workspaces, repositories]);

  // Auto-start Copilot LS when a workspace/repo is selected and copilot is enabled
  useEffect(() => {
    if (!copilotRepoPath) return;

    const rootUri = `file://${copilotRepoPath}`;
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
  }, [copilotRepoPath]);

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
      case "right-sidebar-bookmarks":
        ui.setRightSidebarTab("bookmarks");
        ui.ensureRightSidebarVisible();
        break;
      case "view-team":
        ui.openViewTab("team");
        break;
      case "view-tests":
        ui.openViewTab("tests");
        break;
      case "run-tests": {
        const ws = useWorkspaceStore.getState();
        const testContextId = ws.activeWorkspaceId ?? ws.activeRepoId;
        const testContextType = ws.activeWorkspaceId ? "workspace" : "repo";
        ui.openViewTab("tests");
        if (testContextId) {
          useTestRunnerStore.getState().runTests(testContextId, testContextType as "workspace" | "repo");
        }
        break;
      }
      case "view-usage":
        ui.openViewTab("usage");
        break;
      case "view-activity":
        ui.openViewTab("activity");
        break;
      case "toggle-split-editor": {
        const fvs = useFileViewerStore.getState();
        if (fvs.splitActive) {
          fvs.closeSplit();
        } else {
          fvs.splitEditor();
        }
        break;
      }
      case "open-snippets":
        setShowSnippets(true);
        break;
      case "export-workspace":
        if (activeWorkspaceId) setShowExport(true);
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

  // Full-screen landing page when no workspace/repo is selected,
  // or while the layout mount is being deferred.
  if (!hasContext || !layoutReady) {
    const showSettingsOverlay = activeViewTabId === "settings";

    return (
      <div className="h-screen flex flex-col">
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
      <PanelGroup direction="horizontal">
        <Panel order={1} defaultSize={20} minSize={12} maxSize={30}>
          <ErrorBoundary label="Sidebar">
            <Sidebar />
          </ErrorBoundary>
        </Panel>
        <PanelResizeHandle className="resize-handle-h" />

        <Panel order={2} defaultSize={showRightSidebar ? 55 : 80} minSize={30}>
          <main className="flex h-full flex-col">
            <TopBar activeWs={activeWs} activeRepo={activeRepo} />
            <FileTabBar />
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary label="MainPanel" resetKey={sidebarContext?.id}>
                <MainPanel />
              </ErrorBoundary>
            </div>
          </main>
        </Panel>

        {showRightSidebar && sidebarContext && (
          <>
            <PanelResizeHandle className="resize-handle-h" />
            <Panel order={3} defaultSize={25} minSize={15} maxSize={40}>
              {rightSidebarReady ? (
                <ErrorBoundary label="Panel" resetKey={sidebarContext.id}>
                  <RightSidebar context={sidebarContext} />
                </ErrorBoundary>
              ) : null}
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
      <BookmarkNoteDialog />
      {showSnippets && (
        <SnippetManagerDialog onClose={() => setShowSnippets(false)} />
      )}
      {showExport && activeWorkspaceId && (
        <WorkspaceExportDialog
          workspaceId={activeWorkspaceId}
          onClose={() => setShowExport(false)}
        />
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
