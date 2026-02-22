import { useCallback, useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  useUIStore,
  type RightSidebarTab,
  type BottomTab,
} from "../../stores/uiStore";
import { useDiffStore } from "../../stores/diffStore";
import { FileTreePanel } from "../sidebar/FileTreePanel";
import { ChangesPanel } from "../sidebar/ChangesPanel";
import { ChecksPanel } from "../sidebar/ChecksPanel";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { RunPanel } from "../terminal/RunPanel";
import { SetupPanel } from "../terminal/SetupPanel";
import { ErrorBoundary } from "../ErrorBoundary";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { isMac } from "../../lib/keybindings";
import type { SidebarContext } from "../../App";

interface Props {
  context: SidebarContext;
}

const ALL_TABS: { key: RightSidebarTab; label: string }[] = [
  { key: "files", label: "All files" },
  { key: "changes", label: "Changes" },
  { key: "checks", label: "Checks" },
];

const REPO_TABS: { key: RightSidebarTab; label: string }[] = [
  { key: "files", label: "All files" },
  { key: "changes", label: "Changes" },
];

const BOTTOM_TABS: { key: BottomTab; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "run", label: "Run" },
  { key: "terminal", label: "Terminal" },
];

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
    <div
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
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const label =
                  tab.key === "changes" && changeCount > 0
                    ? `${tab.label} ${changeCount}`
                    : tab.label;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setTab(tab.key)}
                    className="px-5 py-2.5 transition-colors"
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

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary label={activeTab} resetKey={`${context.id}:${activeTab}`}>
                {activeTab === "files" && (
                  <FileTreePanel
                    context={context}
                    onFileClick={handleFileClick}
                    onFileDoubleClick={handleFileDoubleClick}
                  />
                )}
                {activeTab === "changes" && (
                  <ChangesPanel context={context} />
                )}
                {activeTab === "checks" && context.type === "workspace" && (
                  <ChecksPanel workspaceId={context.id} />
                )}
              </ErrorBoundary>
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
                className="flex-shrink-0 rounded p-1 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                title={bottomCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {bottomCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {BOTTOM_TABS.map((tab) => (
                <span
                  key={tab.key}
                  onClick={() => {
                    setBottomTab(tab.key);
                    if (bottomCollapsed) bottomPanelRef.current?.expand();
                  }}
                  className="cursor-pointer rounded px-3 py-1.5 transition-colors"
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
                </span>
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
                </ErrorBoundary>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
