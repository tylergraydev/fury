import { useCallback, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
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

interface Props {
  workspaceId: string;
}

const tabs: { key: RightSidebarTab; label: string }[] = [
  { key: "files", label: "All files" },
  { key: "changes", label: "Changes" },
  { key: "checks", label: "Checks" },
];

const BOTTOM_TABS: { key: BottomTab; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "run", label: "Run" },
  { key: "terminal", label: "Terminal" },
];

export function RightSidebar({ workspaceId }: Props) {
  const activeTab = useUIStore((s) => s.rightSidebarTab);
  const setTab = useUIStore((s) => s.setRightSidebarTab);
  const bottomTab = useUIStore((s) => s.bottomTab);
  const setBottomTab = useUIStore((s) => s.setBottomTab);
  const changeCount = useDiffStore((s) => {
    const diff = s.getDiffResult(workspaceId);
    return diff?.files.length ?? 0;
  });

  const bottomPanelRef = useRef<ImperativePanelHandle>(null);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);

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
            {/* Tab bar */}
            <div
              className="flex items-center text-xs"
              style={{ borderBottom: "1px solid var(--border)" }}
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
                    className="px-3 py-1.5 transition-colors"
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
              {activeTab === "files" && (
                <FileTreePanel workspaceId={workspaceId} />
              )}
              {activeTab === "changes" && (
                <ChangesPanel workspaceId={workspaceId} />
              )}
              {activeTab === "checks" && (
                <ChecksPanel workspaceId={workspaceId} />
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle-v" style={{ cursor: "row-resize" }} />

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
              className="flex items-center gap-1 px-3 py-1 text-xs"
              style={{
                borderBottom: bottomCollapsed
                  ? undefined
                  : "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <button
                onClick={toggleBottomPanel}
                className="flex-shrink-0 rounded px-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)", fontSize: 8 }}
                title={bottomCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {bottomCollapsed ? "\u25B2" : "\u25BC"}
              </button>
              {BOTTOM_TABS.map((tab) => (
                <span
                  key={tab.key}
                  onClick={() => {
                    setBottomTab(tab.key);
                    if (bottomCollapsed) bottomPanelRef.current?.expand();
                  }}
                  className="cursor-pointer rounded px-2 py-0.5 transition-colors"
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
                {bottomTab === "setup" && (
                  <SetupPanel workspaceId={workspaceId} />
                )}
                {bottomTab === "terminal" && (
                  <TerminalPanel workspaceId={workspaceId} />
                )}
                {bottomTab === "run" && (
                  <RunPanel workspaceId={workspaceId} />
                )}
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
