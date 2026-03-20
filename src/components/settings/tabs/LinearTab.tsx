import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

export function LinearTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const [localApiKey, setLocalApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (appSettings?.linear?.apiKey && !initialized) {
      setLocalApiKey(appSettings.linear.apiKey);
      setInitialized(true);
    }
  }, [appSettings, initialized]);

  const handleSave = async () => {
    /* v8 ignore start -- appSettings always defined when save button renders */
    if (!appSettings) return;
    /* v8 ignore stop */
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        ...appSettings,
        linear: { apiKey: localApiKey || null },
      });
      useUIStore.getState().closeViewTab("settings");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!appSettings) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Linear API Key
        </label>
        <div
          className="mb-1.5 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Create a personal API key at linear.app → Settings → API → Personal
          API keys
        </div>
        <div className="flex gap-1">
          <input
            type={showKey ? "text" : "password"}
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder="lin_api_..."
            className="flex-1 rounded px-2 py-1 font-mono text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            className="rounded px-2 py-1 text-[10px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>

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
          className="rounded px-3 py-1.5 text-xs font-medium"
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
