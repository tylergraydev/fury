import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";
import type { AgentType, AppSettings, ProviderType } from "../../../lib/tauri";
import { PROVIDER_ENV_HINTS, PROVIDER_LABELS } from "./types";
import { AddEnvVarRow } from "./AddEnvVarRow";

export function ProviderTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (appSettings && !localSettings) {
      setLocalSettings(appSettings);
    }
  }, [appSettings, localSettings]);

  if (!localSettings) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const providerType = localSettings.provider.providerType;
  const hints = PROVIDER_ENV_HINTS[providerType];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings(localSettings);
      useUIStore.getState().closeViewTab("settings");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const setEnvVar = (key: string, value: string) => {
    setLocalSettings((s) =>
      s
        ? {
            ...s,
            provider: {
              ...s.provider,
              envVars: { ...s.provider.envVars, [key]: value },
            },
          }
        : /* v8 ignore next -- @preserve */ s,
    );
  };

  const removeEnvVar = (key: string) => {
    setLocalSettings((s) => {
      /* v8 ignore next -- @preserve */
      if (!s) return s;
      const { [key]: _, ...rest } = s.provider.envVars;
      return { ...s, provider: { ...s.provider, envVars: rest } };
    });
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Agent type selector */}
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Agent
        </label>
        <select
          value={localSettings.agentType ?? "claude_code"}
          onChange={(e) =>
            setLocalSettings((s) =>
              s
                ? { ...s, agentType: e.target.value as AgentType }
                : /* v8 ignore next -- @preserve */ s,
            )
          }
          className="w-full rounded px-2 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <option value="claude_code">Claude Code</option>
          <option value="codex_cli">Codex CLI</option>
        </select>
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {localSettings.agentType === "codex_cli"
            ? "Uses OpenAI Codex CLI. Requires 'codex' in PATH and OPENAI_API_KEY."
            : "Uses Claude Code CLI. Requires 'claude' in PATH."}
        </div>
      </div>

      {/* Provider selector (Claude Code only) */}
      {localSettings.agentType !== "codex_cli" && (
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Provider
        </label>
        <select
          value={providerType}
          onChange={(e) =>
            setLocalSettings((s) =>
              s
                ? {
                    ...s,
                    provider: {
                      ...s.provider,
                      providerType: e.target.value as ProviderType,
                    },
                  }
                : /* v8 ignore next -- @preserve */ s,
            )
          }
          className="w-full rounded px-2 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      )}

      {/* Codex API key */}
      {localSettings.agentType === "codex_cli" && (
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Configuration
          </label>
          <div className="mb-2">
            <label
              className="mb-0.5 block text-[10px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              OPENAI_API_KEY
            </label>
            <div className="flex gap-1">
              <input
                type={showKeys["OPENAI_API_KEY"] ? "text" : "password"}
                value={localSettings.provider.envVars["OPENAI_API_KEY"] ?? ""}
                onChange={(e) => setEnvVar("OPENAI_API_KEY", e.target.value)}
                placeholder="Enter OPENAI_API_KEY"
                className="flex-1 rounded px-2 py-1 font-mono text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={() =>
                  setShowKeys((s) => ({ ...s, OPENAI_API_KEY: !s["OPENAI_API_KEY"] }))
                }
                className="rounded px-2 py-1 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {showKeys["OPENAI_API_KEY"] ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider-specific env vars (Claude Code only) */}
      {localSettings.agentType !== "codex_cli" && hints.length > 0 && (
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Configuration
          </label>
          {hints.map((key) => (
            <div key={key} className="mb-2">
              <label
                className="mb-0.5 block text-[10px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {key}
              </label>
              <div className="flex gap-1">
                <input
                  type={showKeys[key] ? "text" : "password"}
                  value={localSettings.provider.envVars[key] ?? ""}
                  onChange={(e) => setEnvVar(key, e.target.value)}
                  placeholder={`Enter ${key}`}
                  className="flex-1 rounded px-2 py-1 font-mono text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
                <button
                  onClick={() =>
                    setShowKeys((s) => ({ ...s, [key]: !s[key] }))
                  }
                  className="rounded px-2 py-1 text-[10px]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {showKeys[key] ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Extra env vars */}
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Additional Environment Variables
        </label>
        {Object.entries(localSettings.provider.envVars)
          .filter(([key]) => !hints.includes(key))
          .map(([key, value]) => (
            <div key={key} className="mb-1 flex items-center gap-1 text-xs">
              <span
                className="rounded px-1.5 py-0.5 font-mono"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--accent)",
                }}
              >
                {key}
              </span>
              <span style={{ color: "var(--text-muted)" }}>=</span>
              <span
                className="flex-1 truncate font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {value}
              </span>
              <button
                onClick={() => removeEnvVar(key)}
                className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--error)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        <AddEnvVarRow onAdd={(k, v) => setEnvVar(k, v)} />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => useUIStore.getState().closeViewTab("settings")}
          className="rounded px-3 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded px-3 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
