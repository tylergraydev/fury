import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { lazy, Suspense } from "react";
import { ChatPanel } from "../chat/ChatPanel";

const BrowserPanel = lazy(() => import("./BrowserPanel").then((m) => ({ default: m.BrowserPanel })));

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
  repoId?: string | null;
}

export function SplitBrowserLayout({ contextId, contextType, repoId }: Props) {
  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={20}>
        <div className="h-full">
          <ChatPanel contextId={contextId} contextType={contextType} />
        </div>
      </Panel>
      <PanelResizeHandle className="resize-handle-h" />
      <Panel defaultSize={50} minSize={20}>
        <div className="h-full">
          <Suspense fallback={<div className="flex h-full items-center justify-center opacity-50">Loading…</div>}>
            <BrowserPanel repoId={repoId} />
          </Suspense>
        </div>
      </Panel>
    </PanelGroup>
  );
}
