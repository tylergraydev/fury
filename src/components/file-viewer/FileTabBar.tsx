import { X } from "lucide-react";
import { useFileViewerStore } from "../../stores/fileViewerStore";

export function FileTabBar() {
  const tabs = useFileViewerStore((s) => s.tabs);
  const activeTabId = useFileViewerStore((s) => s.activeTabId);
  const setActiveTab = useFileViewerStore((s) => s.setActiveTab);
  const closeTab = useFileViewerStore((s) => s.closeTab);
  const pinTab = useFileViewerStore((s) => s.pinTab);
  const showChat = useFileViewerStore((s) => s.showChat);

  const isChatActive = activeTabId === null;

  return (
    <div
      className="flex items-center gap-0.5 overflow-x-auto px-1 text-xs"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Chat tab */}
      <button
        onClick={showChat}
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
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const fileName = tab.filePath.split("/").pop() ?? tab.filePath;
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
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => pinTab(tab.id)}
              style={{ fontStyle: tab.pinned ? "normal" : "italic" }}
            >
              {fileName}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
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
