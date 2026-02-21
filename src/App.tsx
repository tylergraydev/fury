import { useCallback, useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SessionTabBar } from "./components/layout/SessionTabBar";
import { ViewTabBar } from "./components/layout/ViewTabBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { FileTabBar } from "./components/file-viewer/FileTabBar";
import { FileViewerPanel } from "./components/file-viewer/FileViewerPanel";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import { MergeView, MergeViewWrapper } from "./components/merge/MergeView";
import { HistoryView } from "./components/history/HistoryView";
import { CommandPalette } from "./components/CommandPalette";
import { LandingPage } from "./components/landing/LandingPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { useKeyboardShortcuts } from "./lib/keybindings";
import { applyTheme } from "./lib/themes";
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
        <>
          {fileTabs.length > 0 && <FileTabBar />}
          <div className="flex-1 overflow-hidden">
            {activeFileTab ? (
              <FileViewerPanel tab={activeFileTab} />
            ) : (
              <ChatPanel contextId={contextId} contextType={contextType} />
            )}
          </div>
        </>
      )}
      {viewType === "settings" && (
        <div className="flex-1 overflow-hidden">
          <AppSettingsPanel />
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

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load repositories and workspaces on mount
  useEffect(() => {
    loadRepositories();
    loadWorkspaces();
  }, [loadRepositories, loadWorkspaces]);

  const hasContext = activeWorkspaceId || activeRepoId;

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
      case "new-workspace":
        setShowPalette(true);
        break;
      case "escape":
        setShowPalette(false);
        break;
    }
  }, []);

  useKeyboardShortcuts(handleAction);

  // Full-screen landing page when no workspace/repo is selected
  if (!hasContext) {
    const showSettingsOverlay = activeViewTabId === "settings";

    return (
      <div className="h-screen">
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
            onOpenChange={setShowPalette}
            onAction={handleAction}
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
    : null;

  const showRightSidebar = rightSidebarVisible && sidebarContext !== null;

  return (
    <div className="h-screen">
      <PanelGroup direction="horizontal" key={showRightSidebar ? "with-right" : "without-right"}>
        <Panel defaultSize={15} minSize={12} maxSize={30}>
          <ErrorBoundary label="Sidebar">
            <Sidebar />
          </ErrorBoundary>
        </Panel>
        <PanelResizeHandle className="resize-handle-h" />

        <Panel defaultSize={showRightSidebar ? 60 : 85} minSize={30}>
          <div className="flex h-full flex-col">
            <TopBar activeWs={activeWs} activeRepo={activeRepo} />
            <SessionTabBar
              workspaceId={activeWorkspaceId}
              workspaceName={activeWs?.name ?? null}
            />
            <ViewTabBar />
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

      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        onAction={handleAction}
      />
    </div>
  );
}

export default App;
