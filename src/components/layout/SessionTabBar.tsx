import { Plus } from "lucide-react";
import { clearSession } from "../../lib/tauri";
import { useChatStore } from "../../stores/chatStore";

interface Props {
  workspaceId: string | null;
  workspaceName: string | null;
}

export function SessionTabBar({ workspaceId, workspaceName }: Props) {
  const handleNewSession = async () => {
    if (!workspaceId) return;
    try {
      await clearSession(workspaceId);
      useChatStore.getState().clearMessages(workspaceId);
    } catch (e) {
      console.error("Failed to clear session:", e);
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-5 py-2 text-sm"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {workspaceId ? (
        <>
          {/* Active session tab */}
          <span
            className="rounded-t px-3.5 py-2"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              borderBottom: "2px solid var(--accent)",
            }}
          >
            {workspaceName ?? "Untitled"}
          </span>

          {/* New session button */}
          <button
            onClick={handleNewSession}
            className="rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="New session"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span style={{ color: "var(--text-muted)" }}>
          Select a workspace
        </span>
      )}
    </div>
  );
}
