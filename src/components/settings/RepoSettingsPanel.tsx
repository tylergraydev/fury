import { useEffect, useState } from "react";
import {
  type RepoSettings,
  getRepoSettings,
  updateRepoSettings,
} from "../../lib/tauri";

interface RepoSettingsPanelProps {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

export function RepoSettingsPanel({
  repoId,
  repoName,
  onClose,
}: RepoSettingsPanelProps) {
  const [settings, setSettings] = useState<RepoSettings>({
    setupScript: null,
    runScript: null,
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: {},
    worktreeBasePath: null,
  });
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRepoSettings(repoId)
      .then(setSettings)
      .catch((e) => setError(String(e)));
  }, [repoId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateRepoSettings(repoId, settings);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    setSettings((s) => ({
      ...s,
      envVars: { ...s.envVars, [newEnvKey.trim()]: newEnvValue },
    }));
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const removeEnvVar = (key: string) => {
    setSettings((s) => {
      const { [key]: _, ...rest } = s.envVars;
      return { ...s, envVars: rest };
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[500px] max-h-[80vh] flex-col rounded-lg"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Settings: {repoName}
          </h2>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="text-xs" style={{ color: "var(--error)" }}>
              {error}
            </div>
          )}

          {/* Scripts */}
          {(["setup", "run", "archive"] as const).map((kind) => {
            const field = `${kind}Script` as keyof RepoSettings;
            return (
              <div key={kind}>
                <label
                  className="mb-1 block text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {kind.charAt(0).toUpperCase() + kind.slice(1)} Script
                </label>
                <textarea
                  value={(settings[field] as string | null) ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      [field]: e.target.value || null,
                    }))
                  }
                  placeholder={`e.g. npm install`}
                  rows={2}
                  className="w-full rounded px-2 py-1.5 font-mono text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    resize: "vertical",
                  }}
                />
              </div>
            );
          })}

          {/* Run script mode */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Run Script Mode
            </label>
            <div className="flex gap-4 text-xs">
              {(["nonconcurrent", "concurrent"] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex items-center gap-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  <input
                    type="radio"
                    name="runScriptMode"
                    checked={settings.runScriptMode === mode}
                    onChange={() =>
                      setSettings((s) => ({ ...s, runScriptMode: mode }))
                    }
                  />
                  {mode === "nonconcurrent"
                    ? "Nonconcurrent (kill previous)"
                    : "Concurrent"}
                </label>
              ))}
            </div>
          </div>

          {/* Environment variables */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Environment Variables
            </label>
            {Object.entries(settings.envVars).map(([key, value]) => (
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
                  style={{ color: "var(--error)" }}
                >
                  x
                </button>
              </div>
            ))}
            <div className="mt-2 flex gap-1">
              <input
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                placeholder="KEY"
                className="w-24 rounded px-1.5 py-0.5 font-mono text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              <input
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                placeholder="value"
                className="flex-1 rounded px-1.5 py-0.5 font-mono text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                onKeyDown={(e) => e.key === "Enter" && addEnvVar()}
              />
              <button
                onClick={addEnvVar}
                className="rounded px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onClose}
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
    </div>
  );
}
