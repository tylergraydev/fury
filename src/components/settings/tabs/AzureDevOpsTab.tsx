import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

export function AzureDevOpsTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const [localPat, setLocalPat] = useState("");
  const [localOrg, setLocalOrg] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (appSettings?.azureDevops && !initialized) {
      setLocalPat(appSettings.azureDevops.pat || "");
      setLocalOrg(appSettings.azureDevops.defaultOrg || "");
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
        azureDevops: {
          pat: localPat || null,
          defaultOrg: localOrg || null,
        },
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
          Personal Access Token (PAT)
        </label>
        <div
          className="mb-1.5 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Create a PAT at dev.azure.com &rarr; User Settings &rarr; Personal
          access tokens. Required scopes: Code (Read &amp; Write), Build (Read &amp; Execute), Work Items (Read &amp; Write).
        </div>
        <div className="flex gap-1">
          <input
            type={showPat ? "text" : "password"}
            value={localPat}
            onChange={(e) => setLocalPat(e.target.value)}
            placeholder="PAT token..."
            className="flex-1 rounded px-2 py-1 font-mono text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShowPat((s) => !s)}
            className="rounded px-2 py-1 text-[10px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {showPat ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Default Organization
        </label>
        <div
          className="mb-1.5 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Your Azure DevOps organization name (optional — auto-detected from
          repo remote URL).
        </div>
        <input
          type="text"
          value={localOrg}
          onChange={(e) => setLocalOrg(e.target.value)}
          placeholder="my-org"
          className="w-full rounded px-2 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            outline: "none",
          }}
        />
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
