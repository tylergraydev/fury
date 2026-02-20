import { useCallback, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SessionTabBar } from "./components/layout/SessionTabBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { FileTabBar } from "./components/file-viewer/FileTabBar";
import { FileViewerPanel } from "./components/file-viewer/FileViewerPanel";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { useFileViewerStore } from "./stores/fileViewerStore";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import { useKeyboardShortcuts } from "./lib/keybindings";
import "./App.css";

export type SidebarContext =
  | { type: "workspace"; id: string }
  | { type: "repo"; id: string };

function MainPanel() {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore();
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const activeTabId = useFileViewerStore((s) => s.activeTabId);
  const activeFileTab = fileTabs.find((t) => t.id === activeTabId) ?? null;

  const hasContext = activeWorkspaceId || activeRepoId;

  if (!hasContext) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h1
          className="mb-2 text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Fury
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Add a repository and click on it to start chatting
        </p>
      </div>
    );
  }

  const contextId = activeWorkspaceId ?? activeRepoId!;
  const contextType = activeWorkspaceId ? "workspace" : "repo";

  return (
    <div className="flex h-full flex-col">
      {fileTabs.length > 0 && <FileTabBar />}
      <div className="flex-1 overflow-hidden">
        {activeFileTab ? (
          <FileViewerPanel tab={activeFileTab} />
        ) : (
          <ChatPanel contextId={contextId} contextType={contextType} />
        )}
      </div>
    </div>
  );
}

function App() {
  const { activeWorkspaceId, activeRepoId, workspaces } = useWorkspaceStore();
  const { repositories } = useRepositoryStore();
  const rightSidebarVisible = useUIStore((s) => s.rightSidebarVisible);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
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
        setShowSettings(true);
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
        setShowSettings(false);
        break;
    }
  }, []);

  useKeyboardShortcuts(handleAction);

  return (
    <div className="h-screen">
      <PanelGroup direction="horizontal" key={showRightSidebar ? "with-right" : "without-right"}>
        <Panel defaultSize={15} minSize={12} maxSize={30}>
          <ErrorBoundary label="Sidebar">
            <Sidebar onOpenSettings={() => setShowSettings(true)} />
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
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary label="Chat" resetKey={sidebarContext?.id}>
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

      {showSettings && (
        <AppSettingsPanel onClose={() => setShowSettings(false)} />
      )}

      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        onAction={handleAction}
      />
    </div>
  );
}

export default App;
