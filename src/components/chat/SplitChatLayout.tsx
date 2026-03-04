import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ChatPanel } from "./ChatPanel";
import { useUIStore, type ChatPaneId } from "../../stores/uiStore";

interface Props {
  leftContextId: string;
  leftContextType: "workspace" | "repo";
  rightContextId: string;
  rightContextType: "workspace" | "repo";
}

function PaneWrapper({
  pane,
  isFocused,
  children,
}: {
  pane: ChatPaneId;
  isFocused: boolean;
  children: React.ReactNode;
}) {
  const setSplitChatFocusedPane = useUIStore((s) => s.setSplitChatFocusedPane);

  return (
    <div
      className="h-full"
      onMouseDown={() => setSplitChatFocusedPane(pane)}
      style={{
        outline: isFocused ? "1px solid var(--accent)" : "none",
        outlineOffset: "-1px",
      }}
    >
      {children}
    </div>
  );
}

export function SplitChatLayout({
  leftContextId,
  leftContextType,
  rightContextId,
  rightContextType,
}: Props) {
  const focusedPane = useUIStore((s) => s.splitChatFocusedPane);

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={20}>
        <PaneWrapper pane="left" isFocused={focusedPane === "left"}>
          <ChatPanel contextId={leftContextId} contextType={leftContextType} />
        </PaneWrapper>
      </Panel>
      <PanelResizeHandle className="resize-handle-h" />
      <Panel defaultSize={50} minSize={20}>
        <PaneWrapper pane="right" isFocused={focusedPane === "right"}>
          <ChatPanel contextId={rightContextId} contextType={rightContextType} />
        </PaneWrapper>
      </Panel>
    </PanelGroup>
  );
}
