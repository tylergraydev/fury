import { useCallback, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import type { WorkspaceInfo } from "../../lib/tauri";

interface Props {
  workspaces: WorkspaceInfo[];
}

export function BroadcastComposer({ workspaces }: Props) {
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(workspaces.map((w) => w.id)),
  );
  const [sending, setSending] = useState(false);

  // Sync selection when workspaces change
  useEffect(() => {
    setSelected((prev) => {
      const wsIds = new Set(workspaces.map((w) => w.id));
      const next = new Set<string>();
      // Keep existing selections that are still valid, add new ones
      for (const id of wsIds) {
        if (prev.has(id) || !prev.size) next.add(id);
      }
      // If nothing was previously selected, select all
      if (next.size === 0) return wsIds;
      return next;
    });
  }, [workspaces]);

  const agents = useAgentStore((s) => s.agents);

  const selectedRunningCount = useMemo(() => {
    let count = 0;
    for (const id of selected) {
      if (agents[id]?.status === "Running") count++;
    }
    return count;
  }, [selected, agents]);

  const allSelectedRunning = selectedRunningCount === selected.size && selected.size > 0;

  const toggleWorkspace = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === workspaces.length) return new Set();
      return new Set(workspaces.map((w) => w.id));
    });
  }, [workspaces]);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || selected.size === 0) return;
    setSending(true);
    try {
      // Add user message to each workspace's chat
      for (const wsId of selected) {
        useChatStore.getState().addUserMessage(wsId, text);
      }
      await useAgentStore.getState().broadcastMessage([...selected], text);
    } finally {
      setSending(false);
      setMessage("");
    }
  }, [message, selected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      className="p-3"
      style={{
        borderTop: "1px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      {/* Workspace checkboxes */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          onClick={toggleAll}
          className="text-[10px] font-medium"
          style={{ color: "var(--accent)" }}
        >
          {selected.size === workspaces.length ? "Deselect all" : "Select all"}
        </button>
        {workspaces.map((ws) => {
          const status = agents[ws.id]?.status ?? "Idle";
          const isRunning = status === "Running";
          return (
            <label
              key={ws.id}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={selected.has(ws.id)}
                onChange={() => toggleWorkspace(ws.id)}
                className="accent-[var(--accent)]"
              />
              <span className={isRunning ? "opacity-50" : ""}>
                {ws.name}
              </span>
              {isRunning && (
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: "var(--success)" }}
                />
              )}
            </label>
          );
        })}
      </div>

      {/* Textarea + send */}
      <div className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Broadcast message to selected workspaces..."
          className="flex-1 resize-none rounded-lg border p-2 text-sm outline-none focus:border-[var(--accent)]"
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            borderColor: "var(--border)",
          }}
          rows={2}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || selected.size === 0 || allSelectedRunning}
          className="flex items-center gap-1.5 self-end rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            backgroundColor: "var(--accent)",
            color: "#000",
          }}
        >
          <Send className="h-3.5 w-3.5" />
          Send to {selected.size}
        </button>
      </div>
    </div>
  );
}
