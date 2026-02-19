import { useCallback, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SessionTabBar } from "./components/layout/SessionTabBar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { CommandPalette } from "./components/CommandPalette";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useUIStore } from "./stores/uiStore";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import {
  useKeyboardShortcuts,
  type ShortcutAction,
} from "./lib/keybindings";
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

  const handleShortcut = useCallback(
    (action: ShortcutAction) => {
      switch (action) {
        case "toggle-palette":
          setShowPalette((v) => !v);
          break;
        case "toggle-right-sidebar":
          useUIStore.getState().toggleRightSidebar();
          break;
        case "focus-terminal":
          useUIStore.getState().setBottomTab("terminal");
          if (!useUIStore.getState().rightSidebarVisible) {
            useUIStore.getState().toggleRightSidebar();
          }
          document
            .querySelector<HTMLElement>("[data-terminal-input]")
            ?.focus();
          break;
        case "open-settings":
          setShowSettings(true);
          break;
        case "right-sidebar-files":
          useUIStore.getState().setRightSidebarTab("files");
          if (!useUIStore.getState().rightSidebarVisible) {
            useUIStore.getState().toggleRightSidebar();
          }
          break;
        case "right-sidebar-changes":
          useUIStore.getState().setRightSidebarTab("changes");
          if (!useUIStore.getState().rightSidebarVisible) {
            useUIStore.getState().toggleRightSidebar();
          }
          break;
        case "right-sidebar-checks":
          useUIStore.getState().setRightSidebarTab("checks");
          if (!useUIStore.getState().rightSidebarVisible) {
            useUIStore.getState().toggleRightSidebar();
          }
          break;
        case "escape":
          setShowPalette(false);
          setShowSettings(false);
          break;
      }
    },
    [],
  );

  useKeyboardShortcuts(handleShortcut);

  const handlePaletteAction = useCallback(
    (action: string) => {
      switch (action) {
        case "toggle-right-sidebar":
          useUIStore.getState().toggleRightSidebar();
          break;
        case "right-sidebar-files":
          useUIStore.getState().setRightSidebarTab("files");
          break;
        case "right-sidebar-changes":
          useUIStore.getState().setRightSidebarTab("changes");
          break;
        case "right-sidebar-checks":
          useUIStore.getState().setRightSidebarTab("checks");
          break;
        case "open-settings":
          setShowSettings(true);
          break;
        case "focus-terminal":
          useUIStore.getState().setBottomTab("terminal");
          if (!useUIStore.getState().rightSidebarVisible) {
            useUIStore.getState().toggleRightSidebar();
          }
          document
            .querySelector<HTMLElement>("[data-terminal-input]")
            ?.focus();
          break;
        case "new-workspace":
          break;
      }
    },
    [],
  );

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
        <PanelGroup direction="horizontal">
          {/* Left sidebar */}
          <Panel defaultSize={15} minSize={12} maxSize={30}>
            <Sidebar />
          </Panel>
          <PanelResizeHandle className="resize-handle-h" style={{ cursor: "col-resize" }} />

          {/* Center area - always chat */}
          <Panel defaultSize={rightSidebarVisible ? 60 : 85} minSize={30}>
            <MainPanel />
          </Panel>

          {/* Right sidebar */}
          {rightSidebarVisible && activeWorkspaceId && (
            <>
              <PanelResizeHandle className="resize-handle-h" style={{ cursor: "col-resize" }} />
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <RightSidebar workspaceId={activeWorkspaceId} />
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
        onAction={handlePaletteAction}
      />
    </div>
  );
}

export default App;
