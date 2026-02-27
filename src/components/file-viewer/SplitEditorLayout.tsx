import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileViewerPanel } from "./FileViewerPanel";
import { ChatPanel } from "../chat/ChatPanel";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import type { PaneId } from "../../stores/fileViewerStore";

interface Props {
  repoId: string | null;
  contextId: string;
  contextType: "workspace" | "repo";
}

function PaneWrapper({
  pane,
  isFocused,
  children,
}: {
  pane: PaneId;
  isFocused: boolean;
  children: React.ReactNode;
}) {
  const setFocusedPane = useFileViewerStore((s) => s.setFocusedPane);

  return (
    <div
      className="h-full"
      onMouseDown={() => setFocusedPane(pane)}
      style={{
        outline: isFocused ? "1px solid var(--accent)" : "none",
        outlineOffset: "-1px",
      }}
    >
      {children}
    </div>
  );
}

export function SplitEditorLayout({ repoId, contextId, contextType }: Props) {
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const leftActiveTabId = useFileViewerStore((s) => s.leftActiveTabId);
  const rightActiveTabId = useFileViewerStore((s) => s.rightActiveTabId);
  const focusedPane = useFileViewerStore((s) => s.focusedPane);

  const leftTab = fileTabs.find((t) => t.id === leftActiveTabId) ?? null;
  const rightTab = fileTabs.find((t) => t.id === rightActiveTabId) ?? null;

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={20}>
        <PaneWrapper pane="left" isFocused={focusedPane === "left"}>
          {leftTab ? (
            <FileViewerPanel tab={leftTab} repoId={repoId} />
          ) : (
            <ChatPanel contextId={contextId} contextType={contextType} />
          )}
        </PaneWrapper>
      </Panel>
      <PanelResizeHandle className="resize-handle-h" />
      <Panel defaultSize={50} minSize={20}>
        <PaneWrapper pane="right" isFocused={focusedPane === "right"}>
          {rightTab ? (
            <FileViewerPanel tab={rightTab} repoId={repoId} />
          ) : (
            <div
              className="flex h-full items-center justify-center text-xs"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}
            >
              Open a file to view it here
            </div>
          )}
        </PaneWrapper>
      </Panel>
    </PanelGroup>
  );
}
