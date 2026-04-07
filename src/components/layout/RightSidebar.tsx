import { useCallback, useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ArrowDown, ArrowUp, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import {
  useUIStore,
  type RightSidebarTab,
  type BottomTab,
} from "../../stores/uiStore";
import { useDiffStore } from "../../stores/diffStore";
import { FileTreePanel } from "../sidebar/FileTreePanel";
import { ChangesPanel } from "../sidebar/ChangesPanel";
import { ChecksPanel } from "../sidebar/ChecksPanel";
import { BookmarksPanel } from "../sidebar/BookmarksPanel";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { RunPanel } from "../terminal/RunPanel";
import { SetupPanel } from "../terminal/SetupPanel";
import { AgentActivityPanel } from "../activity/AgentActivityPanel";
import { ErrorBoundary } from "../ErrorBoundary";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useMergeStore } from "../../stores/mergeStore";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import { isMac } from "../../lib/keybindings";
import type { SidebarContext } from "../../App";

interface Props {
  context: SidebarContext;
}

const ALL_TABS: { key: RightSidebarTab; label: string }[] = [
  { key: "files", label: "All files" },
  { key: "changes", label: "Changes" },
  { key: "checks", label: "Checks" },
  { key: "bookmarks", label: "Bookmarks" },
];

const REPO_TABS: { key: RightSidebarTab; label: string }[] = [
  { key: "files", label: "All files" },
  { key: "changes", label: "Changes" },
  { key: "bookmarks", label: "Bookmarks" },
];

const BOTTOM_TABS: { key: BottomTab; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "run", label: "Run" },
  { key: "terminal", label: "Terminal" },
  { key: "activity", label: "Activity" },
];

function SyncButton({ contextId }: { contextId: string }) {
  const branchStatus = useMergeStore((s) => s.branchStatus[contextId] ?? null);
  const syncing = useMergeStore((s) => s.syncing[contextId] ?? false);
  const syncError = useMergeStore((s) => s.syncError[contextId] ?? null);

  // Double-rAF: defer branch status to Tier 3 so chat data loads first.
  useEffect(() => {
    let inner: number;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        useMergeStore.getState().loadBranchStatus(contextId);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [contextId]);

  /* v8 ignore next 5 -- @preserve defensive guard; button is disabled when syncing */
  const handleSync = () => {
    if (!syncing) {
      useMergeStore.getState().syncBranch(contextId);
    }
  };

  const ahead = branchStatus?.ahead ?? 0;
  const behind = branchStatus?.behind ?? 0;

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      title={syncError ?? "Sync with remote"}
      className="ml-auto mr-2 flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors hover:opacity-80 disabled:opacity-50"
      style={{
        color: syncing
          ? "var(--accent)"
          : syncError
            ? "var(--error)"
            : "var(--text-muted)",
      }}
    >
      {syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <>
          {behind > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "var(--warning)" }}>
              <ArrowDown className="h-3.5 w-3.5" />
              {behind}
            </span>
          )}
          {ahead > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "var(--success)" }}>
              <ArrowUp className="h-3.5 w-3.5" />
              {ahead}
            </span>
          )}
          {ahead === 0 && behind === 0 && (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </>
      )}
    </button>
  );
}

export function RightSidebar({ context }: Props) {
  const activeTab = useUIStore((s) => s.rightSidebarTab);
  const setTab = useUIStore((s) => s.setRightSidebarTab);
  const bottomTab = useUIStore((s) => s.bottomTab);
  const setBottomTab = useUIStore((s) => s.setBottomTab);
  const changeCount = useDiffStore(
    (s) => s.diffResults[context.id]?.files.length ?? 0,
  );

  const tabs = context.type === "workspace" ? ALL_TABS : REPO_TABS;

  // Reset tab to "files" if current tab is "checks" and we switched to repo context
  useEffect(() => {
    if (context.type === "repo" && activeTab === "checks") {
      setTab("files");
    }
  }, [context.type, activeTab, setTab]);

  // Eagerly load diff for the change count badge.
  // Deferred by double-rAF so the initial layout paints first.
  useEffect(() => {
    let inner: number;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const store = useDiffStore.getState();
        if (store.diffResults[context.id] !== undefined) return;
        if (context.type === "workspace") {
          store.loadDiff(context.id);
        } else {
          store.loadRepoDiff(context.id);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [context.type, context.id]);

  const bottomPanelRef = useRef<ImperativePanelHandle>(null);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);

  const handleFileClick = useCallback(
    (filePath: string) => {
      useFileViewerStore
        .getState()
        .openFile(context.id, context.type, filePath);
      useUIStore.getState().setActiveViewTab("chat");
    },
    [context.id, context.type],
  );

  const handleFileDoubleClick = useCallback(
    (filePath: string) => {
      useFileViewerStore
        .getState()
        .openFile(context.id, context.type, filePath, true);
      useUIStore.getState().setActiveViewTab("chat");
    },
    [context.id, context.type],
  );

  const handleRunTestFile = useCallback(
    (filePath: string) => {
      useTestRunnerStore
        .getState()
        .runTests(context.id, context.type, filePath);
      useUIStore.getState().openViewTab("tests");
    },
    [context.id, context.type],
  );

  const toggleBottomPanel = useCallback(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (bottomCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [bottomCollapsed]);

  return (
    <aside
      aria-label="Context panels"
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <PanelGroup direction="vertical">
        {/* Top section: files/changes/checks */}
        <Panel defaultSize={60} minSize={20}>
          <div className="flex h-full flex-col">
            {/* Tab bar — draggable region */}
            <div
              data-tauri-drag-region
              className="flex items-end text-sm"
              style={{
                borderBottom: "1px solid var(--border)",
                /* v8 ignore next -- @preserve */
                paddingTop: isMac ? 42 : 10,
              }}
            >
              <div role="tablist" aria-label="Panel tabs" className="flex min-w-0 flex-1 items-end overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const label =
                    tab.key === "changes" && changeCount > 0
                      ? `${tab.label} ${changeCount}`
                      : tab.label;
                  return (
                    <button
                      key={tab.key}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTab(tab.key)}
                      className="shrink-0 whitespace-nowrap px-5 py-2.5 transition-colors"
                      style={{
                        color: isActive
                          ? "var(--accent)"
                          : "var(--text-muted)",
                        borderBottom: isActive
                          ? "2px solid var(--accent)"
                          : "2px solid transparent",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="shrink-0 pb-2.5">
                <SyncButton contextId={context.id} />
              </div>
            </div>

            {/* Tab content — conditionally rendered to avoid mounting hidden components */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "files" && (
                <div className="h-full">
                  <ErrorBoundary label="files" resetKey={context.id}>
                    <FileTreePanel
                      context={context}
                      onFileClick={handleFileClick}
                      onFileDoubleClick={handleFileDoubleClick}
                      onRunTestFile={handleRunTestFile}
                    />
                  </ErrorBoundary>
                </div>
              )}
              {activeTab === "changes" && (
                <div data-testid="panel-changes" className="h-full">
                  <ErrorBoundary label="changes" resetKey={context.id}>
                    <ChangesPanel context={context} />
                  </ErrorBoundary>
                </div>
              )}
              {context.type === "workspace" && activeTab === "checks" && (
                <div data-testid="panel-checks" className="h-full">
                  <ErrorBoundary label="checks" resetKey={context.id}>
                    <ChecksPanel workspaceId={context.id} />
                  </ErrorBoundary>
                </div>
              )}
              {activeTab === "bookmarks" && (
                <div data-testid="panel-bookmarks" className="h-full">
                  <ErrorBoundary label="bookmarks" resetKey={context.id}>
                    <BookmarksPanel context={context} />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle-v" />

        {/* Bottom section: toolbar + terminal content */}
        <Panel
          ref={bottomPanelRef}
          defaultSize={40}
          minSize={15}
          collapsedSize={5}
          collapsible
          onCollapse={() => setBottomCollapsed(true)}
          onExpand={() => setBottomCollapsed(false)}
        >
          <div className="flex h-full flex-col">
            {/* Terminal tab bar — always visible */}
            <div
              className="flex items-center gap-2 px-4 py-2 text-sm"
              style={{
                borderBottom: bottomCollapsed
                  ? undefined
                  : "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <button
                onClick={toggleBottomPanel}
                className="flex-shrink-0 rounded p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                title={bottomCollapsed ? "Expand panel" : "Collapse panel"}
                aria-label={bottomCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {bottomCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={bottomTab === tab.key}
                  onClick={() => {
                    setBottomTab(tab.key);
                    if (bottomCollapsed) bottomPanelRef.current?.expand();
                  }}
                  className="rounded px-3 py-1.5 transition-colors"
                  style={{
                    backgroundColor:
                      bottomTab === tab.key
                        ? "var(--bg-surface)"
                        : "transparent",
                    color:
                      bottomTab === tab.key
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Terminal content */}
            {!bottomCollapsed && (
              <div className="flex-1 overflow-hidden">
                <ErrorBoundary label={bottomTab} resetKey={`${context.id}:${bottomTab}`}>
                  {bottomTab === "setup" && (
                    <SetupPanel context={context} />
                  )}
                  {bottomTab === "terminal" && (
                    <TerminalPanel context={context} />
                  )}
                  {bottomTab === "run" && (
                    <RunPanel context={context} />
                  )}
                  {bottomTab === "activity" && (
                    <AgentActivityPanel context={context} />
                  )}
                </ErrorBoundary>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </aside>
  );
}
