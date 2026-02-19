import { useCallback, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SessionTabBar } from "./components/layout/SessionTabBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import { useKeyboardShortcuts } from "./lib/keybindings";
import "./App.css";

function MainPanel() {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore();

  if (activeWorkspaceId) {
    return <ChatPanel contextId={activeWorkspaceId} contextType="workspace" />;
  }

  if (activeRepoId) {
    return <ChatPanel contextId={activeRepoId} contextType="repo" />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1
        className="mb-2 text-2xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        Missoula
      </h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Add a repository and click on it to start chatting
      </p>
    </div>
  );
}

function App() {
  const { activeWorkspaceId, workspaces } = useWorkspaceStore();
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
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <TopBar
        activeWs={activeWs}
        activeRepo={activeRepo}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Session tab bar */}
      <SessionTabBar
        workspaceId={activeWorkspaceId}
        workspaceName={activeWs?.name ?? null}
      />

      {/* Main content - three column layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" key={rightSidebarVisible ? "with-right" : "without-right"}>
          <Panel defaultSize={15} minSize={12} maxSize={30}>
            <ErrorBoundary label="Sidebar">
              <Sidebar />
            </ErrorBoundary>
          </Panel>
          <PanelResizeHandle className="resize-handle-h" />

          <Panel defaultSize={rightSidebarVisible ? 60 : 85} minSize={30}>
            <ErrorBoundary label="Chat" resetKey={activeWorkspaceId}>
              <MainPanel />
            </ErrorBoundary>
          </Panel>

          {rightSidebarVisible && activeWorkspaceId && (
            <>
              <PanelResizeHandle className="resize-handle-h" />
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <ErrorBoundary label="Panel" resetKey={activeWorkspaceId}>
                  <RightSidebar workspaceId={activeWorkspaceId} />
                </ErrorBoundary>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

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
