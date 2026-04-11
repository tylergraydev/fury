import { X, Settings, GitMerge, History, FileDiff, Users, Columns2, BarChart3, MessageSquare, Globe, FlaskConical } from "lucide-react";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useUIStore } from "../../stores/uiStore";
import type { PaneId } from "../../stores/fileViewerStore";

const VIEW_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  settings: Settings,
  merge: GitMerge,
  history: History,
  diff: FileDiff,
  team: Users,
  tests: FlaskConical,
  usage: BarChart3,
  browser: Globe,
};

export function FileTabBar() {
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const activeFileTabId = useFileViewerStore((s) => s.activeTabId);
  const setActiveFileTab = useFileViewerStore((s) => s.setActiveTab);
  const closeFileTab = useFileViewerStore((s) => s.closeTab);
  const pinFileTab = useFileViewerStore((s) => s.pinTab);
  const showChat = useFileViewerStore((s) => s.showChat);
  const splitActive = useFileViewerStore((s) => s.splitActive);
  const focusedPane = useFileViewerStore((s) => s.focusedPane);
  const leftActiveTabId = useFileViewerStore((s) => s.leftActiveTabId);
  const rightActiveTabId = useFileViewerStore((s) => s.rightActiveTabId);

  const viewTabs = useUIStore((s) => s.viewTabs);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const setActiveViewTab = useUIStore((s) => s.setActiveViewTab);
  const closeViewTab = useUIStore((s) => s.closeViewTab);
  const pinViewTab = useUIStore((s) => s.pinViewTab);
  const addAgentPane = useUIStore((s) => s.addAgentPane);
  const agentPanes = useUIStore((s) => s.agentPanes);
  const closeAllSplitPanes = useUIStore((s) => s.closeAllSplitPanes);

  const splitBrowserActive = useUIStore((s) => s.splitBrowserActive);
  const splitBrowser = useUIStore((s) => s.splitBrowser);
  const closeSplitBrowser = useUIStore((s) => s.closeSplitBrowser);

  const activeViewTab = viewTabs.find((t) => t.id === activeViewTabId);
  const viewType = activeViewTab?.type ?? "chat";
  const isChatActive = viewType === "chat" && activeFileTabId === null && activeViewTabId === "chat";
  const isBrowserActive = activeViewTabId === "browser" && activeFileTabId === null;
  const hasBrowserTab = viewTabs.some((t) => t.type === "browser");
  const workspaceChatTabs = viewTabs.filter((t) => t.type === "chat" && t.id !== "chat");
  const nonChatViewTabs = viewTabs.filter((t) => t.type !== "chat" && t.type !== "settings" && t.type !== "browser");

  const handleChatClick = () => {
    showChat();
    setActiveViewTab("chat");
  };

  const handleFileTabClick = (tabId: string) => {
    if (splitActive) {
      useFileViewerStore.getState().setActiveTabInPane(focusedPane, tabId);
    } else {
      setActiveFileTab(tabId);
    }
    setActiveViewTab("chat");
  };

  const handleOpenInSplit = (tabId: string) => {
    if (!splitActive) {
      useFileViewerStore.getState().splitEditor(tabId);
    } else {
      const targetPane: PaneId = focusedPane === "left" ? "right" : "left";
      useFileViewerStore.getState().setActiveTabInPane(targetPane, tabId);
    }
    setActiveViewTab("chat");
  };

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex items-center gap-0.5 overflow-x-auto px-1 text-xs"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Chat tab — always first */}
      <button
        role="tab"
        aria-selected={isChatActive}
        onClick={handleChatClick}
        className="flex-shrink-0 px-3 py-1.5 transition-colors"
        style={{
          color: isChatActive ? "var(--accent)" : "var(--text-muted)",
          borderBottom: isChatActive
            ? "2px solid var(--accent)"
            : "2px solid transparent",
        }}
      >
        Chat
      </button>

      {/* Browser tab — next to chat when open */}
      {hasBrowserTab && (
        <div
          role="tab"
          aria-selected={isBrowserActive}
          tabIndex={isBrowserActive ? 0 : -1}
          className="group flex flex-shrink-0 cursor-pointer items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
          style={{
            color: isBrowserActive ? "var(--accent)" : "var(--text-muted)",
            borderBottom: isBrowserActive
              ? "2px solid var(--accent)"
              : "2px solid transparent",
          }}
          onClick={() => {
            showChat();
            setActiveViewTab("browser");
          }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showChat(); setActiveViewTab("browser"); } }}
        >
          <Globe className="h-3 w-3" />
          <span>Browser</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (splitBrowserActive) {
                closeSplitBrowser();
              } else {
                splitBrowser();
              }
            }}
            className="ml-0.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
            style={{ color: splitBrowserActive ? "var(--accent)" : "var(--text-muted)" }}
            title={splitBrowserActive ? "Close split view" : "Split with chat"}
            aria-label={splitBrowserActive ? "Close split view" : "Split with chat"}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeViewTab("browser");
              closeSplitBrowser();
            }}
            className="ml-0.5 rounded p-1 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close Browser"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Workspace-pinned chat tabs */}
      {workspaceChatTabs.map((tab) => {
        const isActive = activeViewTabId === tab.id && activeFileTabId === null;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="group flex flex-shrink-0 cursor-pointer items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            }}
            onClick={() => {
              showChat();
              setActiveViewTab(tab.id);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showChat(); setActiveViewTab(tab.id); } }}
          >
            <MessageSquare className="h-3 w-3" />
            <span className="max-w-[120px] truncate">
              {tab.label}
            </span>
            {tab.contextId && tab.contextType && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addAgentPane(tab.contextId!, tab.contextType!, tab.label);
                  showChat();
                  setActiveViewTab("chat");
                }}
                className="ml-0.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                title="Open in split chat view"
                aria-label="Open in split chat view"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeViewTab(tab.id);
              }}
              className="ml-0.5 rounded p-1 hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
              aria-label={`Close ${tab.label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {/* File tabs */}
      {fileTabs.map((tab) => {
        const isActive = splitActive
          ? (leftActiveTabId === tab.id || rightActiveTabId === tab.id)
          : (viewType === "chat" && activeFileTabId === tab.id);
        const fileName = tab.filePath.split("/").pop()!;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="group flex flex-shrink-0 cursor-pointer items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            }}
            onClick={() => handleFileTabClick(tab.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleFileTabClick(tab.id); } }}
          >
            {tab.dirty && (
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: "var(--accent)" }}
                title="Unsaved changes"
              />
            )}
            {splitActive && leftActiveTabId === tab.id && (
              <span
                className="rounded px-0.5 text-[9px]"
                style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}
              >
                L
              </span>
            )}
            {splitActive && rightActiveTabId === tab.id && (
              <span
                className="rounded px-0.5 text-[9px]"
                style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}
              >
                R
              </span>
            )}
            <span
              onDoubleClick={() => pinFileTab(tab.id)}
              style={{ fontStyle: tab.pinned ? "normal" : "italic" }}
            >
              {fileName}
            </span>
            {fileTabs.length >= 2 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInSplit(tab.id);
                }}
                className="ml-0.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                title="Open in split view"
                aria-label="Open in split view"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            )}
            {tab.saving ? (
              <span
                className="ml-0.5 p-1 text-[10px]"
                style={{ color: "var(--text-muted)" }}
                aria-label="Saving"
              >
                ...
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFileTab(tab.id);
                }}
                className="ml-0.5 rounded p-1 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                aria-label={`Close ${fileName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Split toggle + spacer */}
      <div className="flex flex-1 items-center justify-end">
        {agentPanes.length > 1 && (
          <button
            onClick={() => closeAllSplitPanes()}
            className="flex-shrink-0 rounded p-1 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--accent)" }}
            title="Close split chat view"
            aria-label="Close split chat view"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
        )}
        {fileTabs.length >= 2 && (
          <button
            onClick={() => {
              if (splitActive) {
                useFileViewerStore.getState().closeSplit();
              } else {
                useFileViewerStore.getState().splitEditor();
              }
              setActiveViewTab("chat");
            }}
            className="flex-shrink-0 rounded p-1 hover:bg-[var(--bg-hover)]"
            style={{ color: splitActive ? "var(--accent)" : "var(--text-muted)" }}
            title={splitActive ? "Close split view" : "Split editor"}
            aria-label={splitActive ? "Close split view" : "Split editor"}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* View tabs (Settings, Merge, History) — right side */}
      {nonChatViewTabs.map((tab) => {
        const isActive = activeViewTabId === tab.id;
        const Icon = VIEW_ICONS[tab.type];
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="flex flex-shrink-0 cursor-pointer items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            }}
            onClick={() => setActiveViewTab(tab.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveViewTab(tab.id); } }}
          >
            <span
              className="flex items-center gap-1.5"
              onDoubleClick={() => pinViewTab(tab.id)}
              style={{ fontStyle: tab.pinned ? "normal" : "italic" }}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {tab.label}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeViewTab(tab.id);
              }}
              className="ml-0.5 rounded p-1 hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
              aria-label={`Close ${tab.label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
