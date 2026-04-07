import { Fragment } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { X } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { useUIStore, type AgentPane } from "../../stores/uiStore";

function PaneWrapper({
  index,
  pane,
  isFocused,
  showClose,
  children,
}: {
  index: number;
  pane: AgentPane;
  isFocused: boolean;
  showClose: boolean;
  children: React.ReactNode;
}) {
  const setFocusedPane = useUIStore((s) => s.setFocusedPane);
  const removeAgentPane = useUIStore((s) => s.removeAgentPane);

  return (
    <div
      className="flex h-full flex-col"
      onMouseDown={() => setFocusedPane(index)}
      style={{
        outline: isFocused ? "1px solid var(--accent)" : "none",
        outlineOffset: "-1px",
      }}
    >
      <div
        className="flex h-7 flex-shrink-0 items-center justify-between border-b px-2"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <span
          className="truncate text-xs font-medium"
          style={{ color: isFocused ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {pane.label}
        </span>
        {showClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeAgentPane(pane.id);
            }}
            className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="Close pane"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

interface Props {
  panes: AgentPane[];
}

export function AgentPaneLayout({ panes }: Props) {
  const focusedPaneIndex = useUIStore((s) => s.focusedPaneIndex);

  return (
    <PanelGroup direction="horizontal">
      {panes.map((pane, i) => (
        <Fragment key={pane.id}>
          {i > 0 && <PanelResizeHandle className="resize-handle-h" />}
          <Panel defaultSize={100 / panes.length} minSize={20}>
            <PaneWrapper
              index={i}
              pane={pane}
              isFocused={focusedPaneIndex === i}
              showClose={panes.length > 1}
            >
              <ChatPanel contextId={pane.contextId} contextType={pane.contextType} />
            </PaneWrapper>
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}
