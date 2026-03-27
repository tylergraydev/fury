import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldX, Plus, RotateCcw } from "lucide-react";
import {
  getClaudePermissions,
  addClaudePermissions,
  removeClaudePermissions,
} from "../../../lib/tauri/agent";
import type { ClaudePermissions } from "../../../lib/tauri/agent";

/** Suggested defaults to reduce common permission prompts. */
const SUGGESTED_PRESETS: { label: string; description: string; rules: string[] }[] = [
  {
    label: "Read-only tools",
    description: "Allow reading files, listing directories, and searching code without prompting.",
    rules: ["Read", "Glob", "Grep", "LS"],
  },
  {
    label: "File editing",
    description: "Allow writing and editing files.",
    rules: ["Edit", "Write", "NotebookEdit"],
  },
  {
    label: "Shell commands",
    description: "Allow executing bash/shell commands. Use with caution.",
    rules: ["Bash(*)"],
  },
  {
    label: "MCP tools",
    description: "Allow all MCP server tools.",
    rules: ["mcp__*"],
  },
  {
    label: "Agent tools",
    description: "Allow task management and sub-agent tools.",
    rules: ["Agent", "TaskCreate", "TaskUpdate"],
  },
];

export function PermissionsTab() {
  const [permissions, setPermissions] = useState<ClaudePermissions | null>(null);
  const [settingsPath, setSettingsPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customRule, setCustomRule] = useState("");

  const load = useCallback(async () => {
    try {
      const resp = await getClaudePermissions();
      setPermissions(resp.permissions);
      setSettingsPath(resp.settingsPath);
    } catch (e) {
      console.error("Failed to load Claude permissions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(async (rules: string[]) => {
    setSaving(true);
    try {
      const updated = await addClaudePermissions(rules);
      setPermissions(updated);
    } catch (e) {
      console.error("Failed to add permissions:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleRemove = useCallback(async (rules: string[]) => {
    setSaving(true);
    try {
      const updated = await removeClaudePermissions(rules);
      setPermissions(updated);
    } catch (e) {
      console.error("Failed to remove permissions:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleAddCustom = useCallback(() => {
    const rule = customRule.trim();
    if (!rule) return;
    handleAdd([rule]);
    setCustomRule("");
  }, [customRule, handleAdd]);

  if (loading) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const currentRules = permissions?.allow ?? [];

  return (
    <div className="p-4 space-y-5">
      <div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
          Manage which tools the Claude agent can use without prompting. These rules are saved to{" "}
          <code className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            {settingsPath}
          </code>{" "}
          and shared with Claude Code CLI.
        </div>
      </div>

      {/* Suggested presets */}
      <div>
        <h3
          className="text-xs font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Suggested Defaults
        </h3>
        <div className="space-y-2">
          {SUGGESTED_PRESETS.map((preset) => {
            const allApplied = preset.rules.every((r) => currentRules.includes(r));
            const someApplied = preset.rules.some((r) => currentRules.includes(r));
            return (
              <div
                key={preset.label}
                className="flex items-center justify-between rounded p-2.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck
                      className="h-3 w-3 flex-shrink-0"
                      style={{ color: allApplied ? "var(--success)" : "var(--text-muted)" }}
                    />
                    <span className="text-xs" style={{ color: "var(--text-primary)" }}>
                      {preset.label}
                    </span>
                    {someApplied && !allApplied && (
                      <span className="text-[10px]" style={{ color: "var(--warning)" }}>partial</span>
                    )}
                  </div>
                  <div
                    className="text-[10px] mt-0.5 ml-[18px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {preset.description}
                  </div>
                  <div className="text-[10px] mt-0.5 ml-[18px] font-mono" style={{ color: "var(--text-muted)" }}>
                    {preset.rules.join(", ")}
                  </div>
                </div>
                {allApplied ? (
                  <button
                    onClick={() => handleRemove(preset.rules)}
                    disabled={saving}
                    className="rounded px-2.5 py-1 text-[10px] font-medium transition-colors flex items-center gap-1"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
                      color: "var(--error)",
                      border: "1px solid color-mix(in srgb, var(--error) 30%, transparent)",
                    }}
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => handleAdd(preset.rules)}
                    disabled={saving}
                    className="rounded px-2.5 py-1 text-[10px] font-medium transition-colors flex items-center gap-1"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)",
                      color: "var(--success)",
                      border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                    }}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Apply
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current rules */}
      <div>
        <h3
          className="text-xs font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Current Allow Rules
        </h3>
        {currentRules.length === 0 ? (
          <div
            className="text-[10px] rounded p-3"
            style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            No allow rules configured. The agent will prompt for every tool use.
          </div>
        ) : (
          <div className="space-y-1">
            {currentRules.map((rule) => (
              <div
                key={rule}
                className="flex items-center justify-between rounded px-2.5 py-1.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <code className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                  {rule}
                </code>
                <button
                  onClick={() => handleRemove([rule])}
                  disabled={saving}
                  className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-muted)" }}
                  title="Remove rule"
                >
                  <ShieldX className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add custom rule */}
      <div>
        <h3
          className="text-xs font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Add Custom Rule
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customRule}
            onChange={(e) => setCustomRule(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCustom();
            }}
            placeholder='e.g. Bash(npm test), Write, mcp__github__*'
            className="flex-1 rounded px-2.5 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={handleAddCustom}
            disabled={saving || !customRule.trim()}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: !customRule.trim() ? 0.5 : 1,
            }}
          >
            Add
          </button>
        </div>
        <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          Use <code>*</code> for wildcards. Examples: <code>Bash(*)</code>, <code>mcp__github__*</code>, <code>Read</code>
        </div>
      </div>
    </div>
  );
}
