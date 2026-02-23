import { X, Settings, GitMerge, History, FileDiff } from "lucide-react";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useUIStore } from "../../stores/uiStore";

const VIEW_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  settings: Settings,
  merge: GitMerge,
  history: History,
  diff: FileDiff,
};

export function FileTabBar() {
  const fileTabs = useFileViewerStore((s) => s.tabs);
  const activeFileTabId = useFileViewerStore((s) => s.activeTabId);
  const setActiveFileTab = useFileViewerStore((s) => s.setActiveTab);
  const closeFileTab = useFileViewerStore((s) => s.closeTab);
  const pinFileTab = useFileViewerStore((s) => s.pinTab);
  const showChat = useFileViewerStore((s) => s.showChat);

  const viewTabs = useUIStore((s) => s.viewTabs);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const setActiveViewTab = useUIStore((s) => s.setActiveViewTab);
  const closeViewTab = useUIStore((s) => s.closeViewTab);
  const pinViewTab = useUIStore((s) => s.pinViewTab);

  const viewType = viewTabs.find((t) => t.id === activeViewTabId)?.type ?? "chat";
  const isChatActive = viewType === "chat" && activeFileTabId === null;
  const nonChatViewTabs = viewTabs.filter((t) => t.type !== "chat" && t.type !== "settings");

  const handleChatClick = () => {
    showChat();
    setActiveViewTab("chat");
  };

  const handleFileTabClick = (tabId: string) => {
    setActiveFileTab(tabId);
    setActiveViewTab("chat");
  };

  return (
    <div
      className="flex items-center gap-0.5 overflow-x-auto px-1 text-xs"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Chat tab — always first */}
      <button
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

      {/* File tabs */}
      {fileTabs.map((tab) => {
        const isActive = viewType === "chat" && activeFileTabId === tab.id;
        const fileName = tab.filePath.split("/").pop()!;
        return (
          <span
            key={tab.id}
            className="flex flex-shrink-0 items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {tab.dirty && (
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: "var(--accent)" }}
                title="Unsaved changes"
              />
            )}
            <span
              onClick={() => handleFileTabClick(tab.id)}
              onDoubleClick={() => pinFileTab(tab.id)}
              style={{ fontStyle: tab.pinned ? "normal" : "italic" }}
            >
              {fileName}
            </span>
            {tab.saving ? (
              <span
                className="ml-0.5 p-0.5 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                ...
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFileTab(tab.id);
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {/* Spacer between file tabs and view tabs */}
      {nonChatViewTabs.length > 0 && <div className="flex-1" />}

      {/* View tabs (Settings, Merge, History) — right side */}
      {nonChatViewTabs.map((tab) => {
        const isActive = activeViewTabId === tab.id;
        const Icon = VIEW_ICONS[tab.type];
        return (
          <span
            key={tab.id}
            className="flex flex-shrink-0 items-center gap-1 py-1.5 pl-3 pr-1 transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            <span
              className="flex items-center gap-1.5"
              onClick={() => setActiveViewTab(tab.id)}
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
              className="ml-0.5 rounded p-0.5 hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
