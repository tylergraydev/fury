import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";

export function ExperimentalTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!appSettings) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const toggle = async (key: "spotlightTesting" | "agentTeams" | "persistentProcesses" | "safeMode") => {
    setSaving(true);
    try {
      await saveSettings({
        ...appSettings,
        experimental: {
          ...appSettings.experimental,
          [key]: !appSettings.experimental[key],
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const TOGGLES: { key: "spotlightTesting" | "agentTeams" | "persistentProcesses" | "safeMode"; label: string; description: string }[] = [
    { key: "spotlightTesting", label: "Spotlight Testing", description: "Watch workspace worktree for file changes and sync them to the repo root in real-time. Enables running tests against the agent's changes without switching branches." },
    { key: "agentTeams", label: "Agent Teams", description: "Make agents aware of sibling workspaces in the same repo. Sets FURY_AGENT_TEAMS and FURY_TEAM_WORKSPACES environment variables so agents can coordinate." },
    { key: "persistentProcesses", label: "Performance Mode", description: "Keep Claude processes alive between turns to eliminate startup latency. Uses more memory per workspace. When disabled (Low RAM mode), a new process is spawned for each turn." },
    { key: "safeMode", label: "Safe Mode", description: "Require approval before the agent executes tool calls like file writes and bash commands. When disabled, all tool calls are auto-approved." },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        These features are experimental and may change or be removed.
      </div>

      {TOGGLES.map(({ key, label, description }) => {
        const isDisabledForCodex = key === "persistentProcesses" && appSettings.agentType === "codex_cli";
        return (
        <div
          key={key}
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            opacity: isDisabledForCodex ? 0.5 : 1,
          }}
        >
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
            <input
              type="checkbox"
              checked={appSettings.experimental[key]}
              onChange={() => toggle(key)}
              disabled={saving || isDisabledForCodex}
            />
            {label}
            {isDisabledForCodex && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                (Not available with Codex CLI)
              </span>
            )}
          </label>
          <div
            className="mt-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {description}
          </div>
        </div>
        );
      })}
    </div>
  );
}
