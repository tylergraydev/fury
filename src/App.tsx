import { useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { DiffViewer } from "./components/diff/DiffViewer";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useAgentStore } from "./stores/agentStore";
import { useUIStore } from "./stores/uiStore";
import "./App.css";

function MainPanel() {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore();
  const viewMode = useUIStore((s) => s.viewMode);

  if (activeWorkspaceId) {
    if (viewMode === "diff") {
      return <DiffViewer workspaceId={activeWorkspaceId} />;
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

function BottomPanel() {
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        <span
          className="cursor-pointer rounded px-2 py-0.5"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          Terminal
        </span>
      </div>
      <div
        className="flex-1 p-2 font-mono text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Terminal ready (Phase 4)
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
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeRepo = repositories.find((r) => r.id === activeRepoId);

  // Cmd/Ctrl+D to toggle diff viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        useUIStore.getState().toggleDiff();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-1.5 text-sm"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-semibold">Missoula</span>
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
    </div>
  );
}

export default App;
