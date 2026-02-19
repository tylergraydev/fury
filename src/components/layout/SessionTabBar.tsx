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
      className="flex items-center gap-1 px-3 py-1 text-xs"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {workspaceId ? (
        <>
          {/* Active session tab */}
          <span
            className="rounded-t px-2.5 py-1"
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
            className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="New session"
          >
            +
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
