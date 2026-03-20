import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { McpScope } from "../../../lib/tauri";
import { AddEnvVarRow } from "./AddEnvVarRow";

export function McpTab() {
  const { mcpServers, loadMcpServers, addMcpServer, removeMcpServer, error, loading } =
    useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newScope, setNewScope] = useState<McpScope>("user");
  const [newEnvPairs, setNewEnvPairs] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    loadMcpServers();
  }, [loadMcpServers]);

  const handleAdd = async () => {
    /* v8 ignore next -- @preserve: button is disabled when inputs are empty */
    if (!newName.trim() || !newCommand.trim()) return;
    setAdding(true);
    setLocalError(null);
    try {
      await addMcpServer({
        name: newName.trim(),
        command: newCommand.trim(),
        args: newArgs
          .trim()
          .split(/\s+/)
          .filter((a) => a),
        env: newEnvPairs,
        scope: newScope,
      });
      setShowAddForm(false);
      setNewName("");
      setNewCommand("");
      setNewArgs("");
      setNewEnvPairs({});
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string, scope: McpScope) => {
    try {
      await removeMcpServer({ name, scope });
    } catch (e) {
      setLocalError(String(e));
    }
  };

  return (
    <div className="p-4 space-y-3">
      {(error || localError) && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {localError || error}
        </div>
      )}

      {/* Server list */}
      {loading ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading MCP servers…
        </div>
      ) : mcpServers.length === 0 ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          No MCP servers configured.
        </div>
      ) : (
        <div className="space-y-1">
          {mcpServers.map((server) => (
            <div
              key={`${server.scope}-${server.name}`}
              className="flex items-center gap-2 rounded px-2 py-1.5"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border)",
              }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {server.name}
              </span>
              <span
                className="rounded px-1 py-0.5 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-muted)",
                }}
              >
                {server.scope}
              </span>
              <span
                className="flex-1 truncate font-mono text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                {server.command} {server.args.join(" ")}
              </span>
              <button
                onClick={() => handleRemove(server.name, server.scope)}
                className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--error)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAddForm ? (
        <div
          className="space-y-2 rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Server name"
            className="w-full rounded px-2 py-1 text-xs"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <input
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="Command (e.g. npx, node)"
            className="w-full rounded px-2 py-1 font-mono text-xs"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <input
            value={newArgs}
            onChange={(e) => setNewArgs(e.target.value)}
            placeholder="Arguments (space-separated)"
            className="w-full rounded px-2 py-1 font-mono text-xs"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <div className="flex gap-4 text-xs">
            {(["user", "project"] as McpScope[]).map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-1"
                style={{ color: "var(--text-primary)" }}
              >
                <input
                  type="radio"
                  name="mcpScope"
                  checked={newScope === scope}
                  onChange={() => setNewScope(scope)}
                />
                {scope.charAt(0).toUpperCase() + scope.slice(1)}
              </label>
            ))}
          </div>

          {/* Env vars for new server */}
          <div>
            <label
              className="mb-1 block text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Environment Variables
            </label>
            {Object.entries(newEnvPairs).map(([key, value]) => (
              <div key={key} className="mb-1 flex items-center gap-1 text-xs">
                <span className="font-mono" style={{ color: "var(--accent)" }}>
                  {key}
                </span>
                <span style={{ color: "var(--text-muted)" }}>=</span>
                <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                  {value}
                </span>
                <button
                  onClick={() => {
                    const { [key]: _, ...rest } = newEnvPairs;
                    setNewEnvPairs(rest);
                  }}
                  className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--error)" }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <AddEnvVarRow
              onAdd={(k, v) => setNewEnvPairs((p) => ({ ...p, [k]: v }))}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newCommand.trim()}
              className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
                opacity:
                  adding || !newName.trim() || !newCommand.trim() ? 0.5 : 1,
              }}
            >
              {adding ? "Adding..." : "Add Server"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add MCP Server
        </button>
      )}
    </div>
  );
}
