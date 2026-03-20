import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";
import { useUIStore } from "../../../stores/uiStore";
import type { ClaudeContextSettings, IndexingStatus } from "../../../lib/tauri";
import { indexRepository, listIndexingStatuses } from "../../../lib/tauri";

export function CodeSearchTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const { repositories } = useRepositoryStore();
  const [localSettings, setLocalSettings] = useState<ClaudeContextSettings | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [indexingStatuses, setIndexingStatuses] = useState<Record<string, IndexingStatus>>({});
  const [reindexing, setReindexing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (appSettings?.claudeContext && !initialized) {
      setLocalSettings(appSettings.claudeContext);
      setInitialized(true);
    }
  }, [appSettings, initialized]);

  // Poll indexing statuses
  useEffect(() => {
    const poll = async () => {
      try {
        const statuses = await listIndexingStatuses();
        const map: Record<string, IndexingStatus> = {};
        statuses.forEach((s) => {
          map[s.repoId] = s;
        });
        setIndexingStatuses(map);
      } catch {
        /* ignore */
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!localSettings || !appSettings) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        ...appSettings,
        claudeContext: localSettings,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async (repoId: string) => {
    setReindexing((s) => ({ ...s, [repoId]: true }));
    try {
      await indexRepository(repoId);
    } catch {
      /* status will show error */
    } finally {
      setReindexing((s) => ({ ...s, [repoId]: false }));
    }
  };

  const CREDENTIAL_FIELDS: { key: keyof ClaudeContextSettings; label: string; placeholder: string }[] = [
    { key: "openaiApiKey", label: "OPENAI_API_KEY", placeholder: "sk-..." },
    { key: "zillizUri", label: "MILVUS_ADDRESS", placeholder: "https://..." },
    { key: "zillizToken", label: "MILVUS_TOKEN", placeholder: "Enter token" },
  ];

  const statusColor = (status: IndexingStatus["status"]) => {
    switch (status) {
      case "indexed": return "var(--success)";
      case "indexing": return "var(--accent)";
      case "error": return "var(--error)";
      default: return "var(--text-muted)";
    }
  };

  const statusLabel = (status: IndexingStatus["status"]) => {
    switch (status) {
      case "indexed": return "Indexed";
      case "indexing": return "Indexing...";
      case "error": return "Error";
      default: return "Not indexed";
    }
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Enable toggle */}
      <div
        className="rounded p-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <label
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={localSettings.enabled}
            onChange={() =>
              setLocalSettings((s) =>
                /* v8 ignore start -- localSettings is always non-null when checkbox renders */
                s ? { ...s, enabled: !s.enabled } : s,
                /* v8 ignore stop */
              )
            }
          />
          Enable Semantic Code Search
        </label>
        <div
          className="mt-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Index repositories with vector embeddings for semantic code search.
          Powered by claude-context (Zilliz). Requires an OpenAI API key and
          a free Zilliz Cloud account.
        </div>
      </div>

      {/* Credentials */}
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Credentials
        </label>
        {CREDENTIAL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="mb-2">
            <label
              className="mb-0.5 block text-[10px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </label>
            <div className="flex gap-1">
              <input
                type={showKeys[key] ? "text" : "password"}
                value={(localSettings[key] as string | null) ?? ""}
                onChange={(e) =>
                  setLocalSettings((s) =>
                    /* v8 ignore start -- localSettings is always non-null when inputs render */
                    s ? { ...s, [key]: e.target.value || null } : s,
                    /* v8 ignore stop */
                  )
                }
                placeholder={placeholder}
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

      {/* Save */}
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

      {/* Repository indexing status */}
      {repositories.length > 0 && (
        <div>
          <label
            className="mb-2 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Repository Indexing Status
          </label>
          <div className="space-y-1">
            {repositories.map((repo) => {
              const status = indexingStatuses[repo.id];
              const state = status?.status ?? "not_indexed";
              const isReindexing = reindexing[repo.id];
              return (
                <div
                  key={repo.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: statusColor(state) }}
                  />
                  <span
                    className="flex-1 truncate text-xs font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {repo.name}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {statusLabel(state)}
                  </span>
                  {status?.lastIndexedAt && (
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {new Date(status.lastIndexedAt).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => handleReindex(repo.id)}
                    disabled={isReindexing || state === "indexing"}
                    className="rounded px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      opacity: isReindexing || state === "indexing" ? 0.5 : 1,
                    }}
                  >
                    {isReindexing || state === "indexing" ? "Indexing..." : "Re-index"}
                  </button>
                </div>
              );
            })}
          </div>
          {Object.values(indexingStatuses).some((s) => s.status === "error") && (
            <div className="mt-2 text-xs" style={{ color: "var(--error)" }}>
              {Object.values(indexingStatuses)
                .filter((s) => s.status === "error")
                .map((s) => s.error)
                .join("; ")}
            </div>
          )}
        </div>
      )}

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Repositories are automatically indexed when added. Semantic search is
        available to agents via the claude-context MCP server.
      </div>
    </div>
  );
}
