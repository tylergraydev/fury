import { useCallback, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { DiffViewer } from "./components/diff/DiffViewer";
import { PRPanel } from "./components/pr/PRPanel";
import { NotesPanel } from "./components/notes/NotesPanel";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { RunPanel } from "./components/terminal/RunPanel";
import { CommandPalette } from "./components/CommandPalette";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useAgentStore } from "./stores/agentStore";
import { useUIStore } from "./stores/uiStore";
import { AppSettingsPanel } from "./components/settings/AppSettingsPanel";
import {
  useKeyboardShortcuts,
  type ShortcutAction,
  modLabel,
  isMac,
} from "./lib/keybindings";
import "./App.css";

function MainPanel() {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore();
  const viewMode = useUIStore((s) => s.viewMode);

  if (activeWorkspaceId) {
    if (viewMode === "diff") {
      return <DiffViewer workspaceId={activeWorkspaceId} />;
    }
    if (viewMode === "pr") {
      return <PRPanel workspaceId={activeWorkspaceId} />;
    }
    if (viewMode === "notes") {
      return <NotesPanel workspaceId={activeWorkspaceId} />;
    }
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

type BottomTab = "terminal" | "run";

function BottomPanel() {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState<BottomTab>("terminal");

  if (!activeWorkspaceId) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-muted)",
        }}
      >
        Select a workspace to use the terminal
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-2 px-3 py-1 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        {(["terminal", "run"] as BottomTab[]).map((tab) => (
          <span
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="cursor-pointer rounded px-2 py-0.5 transition-colors"
            style={{
              backgroundColor:
                activeTab === tab ? "var(--bg-surface)" : "transparent",
              color:
                activeTab === tab ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {tab === "terminal" ? "Terminal" : "Run"}
          </span>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "terminal" && (
          <TerminalPanel workspaceId={activeWorkspaceId} />
        )}
        {activeTab === "run" && (
          <RunPanel workspaceId={activeWorkspaceId} />
        )}
      </div>
    </div>
  );
}

function AgentStatusBadge({ contextId }: { contextId: string }) {
  const status = useAgentStore((s) => s.getStatus(contextId));

  const isRunning = status === "Running";
  const isError = typeof status === "object" && "Error" in status;
  const color = isRunning
    ? "var(--success)"
    : isError
      ? "var(--error)"
      : "var(--text-muted)";
  const label = isRunning
    ? "Agent running"
    : isError
      ? "Agent error"
      : "Agent idle";

  return (
    <span
      className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
      style={{ backgroundColor: color }}
      title={label}
    />
  );
}

function App() {
  const { activeWorkspaceId, activeRepoId, workspaces } = useWorkspaceStore();
  const { repositories } = useRepositoryStore();
  const viewMode = useUIStore((s) => s.viewMode);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeRepo = repositories.find((r) => r.id === activeRepoId);

  const handleShortcut = useCallback(
    (action: ShortcutAction) => {
      switch (action) {
        case "toggle-palette":
          setShowPalette((v) => !v);
          break;
        case "toggle-diff":
          useUIStore.getState().toggleDiff();
          break;
        case "focus-terminal":
          // Terminal panel gets focus via DOM
          document
            .querySelector<HTMLElement>("[data-terminal-input]")
            ?.focus();
          break;
        case "open-settings":
          setShowSettings(true);
          break;
        case "view-chat":
          useUIStore.getState().setViewMode("chat");
          break;
        case "view-diff":
          useUIStore.getState().setViewMode("diff");
          break;
        case "view-pr":
          useUIStore.getState().setViewMode("pr");
          break;
        case "view-notes":
          useUIStore.getState().setViewMode("notes");
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
        case "view-chat":
          useUIStore.getState().setViewMode("chat");
          break;
        case "view-diff":
          useUIStore.getState().setViewMode("diff");
          break;
        case "view-pr":
          useUIStore.getState().setViewMode("pr");
          break;
        case "view-notes":
          useUIStore.getState().setViewMode("notes");
          break;
        case "open-settings":
          setShowSettings(true);
          break;
        case "focus-terminal":
          document
            .querySelector<HTMLElement>("[data-terminal-input]")
            ?.focus();
          break;
        case "new-workspace":
          // Trigger new workspace dialog via sidebar
          break;
      }
    },
    [],
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar — extra left padding on macOS for traffic-light buttons */}
      <div
        className="flex items-center gap-3 py-1.5 pr-4 text-sm"
        style={{
          paddingLeft: isMac ? 80 : 16,
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-semibold">Missoula</span>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
          title={`Settings (${modLabel}+,)`}
        >
          Settings
        </button>
        {activeWs && (
          <>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {activeWs.name}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {activeWs.branch}
            </span>
            <AgentStatusBadge contextId={activeWs.id} />
            {/* View mode tabs */}
            <span
              className="ml-2 flex gap-1 rounded px-1 py-0.5 text-[10px]"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <button
                onClick={() => useUIStore.getState().setViewMode("chat")}
                className="rounded px-1.5 py-0.5 transition-colors"
                style={{
                  backgroundColor:
                    viewMode === "chat" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "chat"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              >
                Chat
              </button>
              <button
                onClick={() => useUIStore.getState().setViewMode("diff")}
                className="rounded px-1.5 py-0.5 transition-colors"
                style={{
                  backgroundColor:
                    viewMode === "diff" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "diff"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              >
                Diff
              </button>
              <button
                onClick={() => useUIStore.getState().setViewMode("pr")}
                className="rounded px-1.5 py-0.5 transition-colors"
                style={{
                  backgroundColor:
                    viewMode === "pr" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "pr"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              >
                PR
              </button>
              <button
                onClick={() => useUIStore.getState().setViewMode("notes")}
                className="rounded px-1.5 py-0.5 transition-colors"
                style={{
                  backgroundColor:
                    viewMode === "notes" ? "var(--bg-surface)" : "transparent",
                  color:
                    viewMode === "notes"
                      ? "var(--accent)"
                      : "var(--text-muted)",
                }}
              >
                Notes
              </button>
            </span>
          </>
        )}
        {activeRepo && !activeWs && (
          <>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {activeRepo.name}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {activeRepo.currentBranch ?? activeRepo.defaultBranch}
            </span>
            <AgentStatusBadge contextId={activeRepo.id} />
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1">
        <PanelGroup direction="horizontal">
          {/* Sidebar */}
          <Panel defaultSize={20} minSize={15} maxSize={35}>
            <Sidebar />
          </Panel>
          <PanelResizeHandle
            className="w-px"
            style={{ backgroundColor: "var(--border)" }}
          />

          {/* Center area */}
          <Panel defaultSize={80}>
            <PanelGroup direction="vertical">
              {/* Main panel (chat/diff/notes) */}
              <Panel defaultSize={70} minSize={30}>
                <MainPanel />
              </Panel>
              <PanelResizeHandle
                className="h-px"
                style={{ backgroundColor: "var(--border)" }}
              />

              {/* Bottom panel (terminal/run) */}
              <Panel defaultSize={30} minSize={15} collapsible>
                <BottomPanel />
              </Panel>
            </PanelGroup>
          </Panel>
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
