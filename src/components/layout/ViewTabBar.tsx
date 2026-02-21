import { MessageSquare, Settings, GitMerge, History, X } from "lucide-react";
import { useUIStore, type ViewType } from "../../stores/uiStore";

const VIEW_ICONS: Record<ViewType, React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  settings: Settings,
  merge: GitMerge,
  history: History,
};

export function ViewTabBar() {
  const viewTabs = useUIStore((s) => s.viewTabs);
  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const setActiveViewTab = useUIStore((s) => s.setActiveViewTab);
  const closeViewTab = useUIStore((s) => s.closeViewTab);
  const pinViewTab = useUIStore((s) => s.pinViewTab);

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto px-3 text-sm"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {viewTabs.map((tab) => {
        const isActive = activeViewTabId === tab.id;
        const isChat = tab.type === "chat";
        const Icon = VIEW_ICONS[tab.type];

        return (
          <span
            key={tab.id}
            className="flex flex-shrink-0 items-center gap-2 py-2.5 pl-4 pr-2 transition-colors"
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
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </span>
            {!isChat && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeViewTab(tab.id);
                }}
                className="ml-0.5 rounded p-1 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
