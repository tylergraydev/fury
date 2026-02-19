import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type {
  AppSettings,
  ProviderType,
  McpScope,
  CursorMigrationResult,
} from "../../lib/tauri";

type SettingsTab = "provider" | "mcp" | "migration";

const PROVIDER_ENV_HINTS: Record<ProviderType, string[]> = {
  Anthropic: ["ANTHROPIC_API_KEY"],
  OpenRouter: ["OPENROUTER_API_KEY"],
  VercelAIGateway: ["VERCEL_API_KEY"],
  Bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
  Vertex: ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_PROJECT_ID"],
  AzureFoundry: ["AZURE_API_KEY", "AZURE_ENDPOINT"],
  Custom: [],
};

const PROVIDER_LABELS: Record<ProviderType, string> = {
  Anthropic: "Anthropic",
  OpenRouter: "OpenRouter",
  VercelAIGateway: "Vercel AI Gateway",
  Bedrock: "AWS Bedrock",
  Vertex: "Google Vertex",
  AzureFoundry: "Azure Foundry",
  Custom: "Custom",
};

interface AppSettingsPanelProps {
  onClose: () => void;
}

export function AppSettingsPanel({ onClose }: AppSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("provider");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[560px] max-h-[80vh] flex-col rounded-lg"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header with tabs */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Settings
            </h2>
            <div className="flex gap-1">
              {(["provider", "mcp", "migration"] as SettingsTab[]).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="rounded px-2 py-0.5 text-xs transition-colors"
                    style={{
                      backgroundColor:
                        activeTab === tab
                          ? "var(--bg-surface)"
                          : "transparent",
                      color:
                        activeTab === tab
                          ? "var(--accent)"
                          : "var(--text-muted)",
                    }}
                  >
                    {tab === "provider"
                      ? "Provider"
                      : tab === "mcp"
                        ? "MCP Servers"
                        : "Migration"}
                  </button>
                ),
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            x
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "provider" && <ProviderTab onClose={onClose} />}
          {activeTab === "mcp" && <McpTab />}
          {activeTab === "migration" && <MigrationTab />}
        </div>
      </div>
    </div>
  );
}

function ProviderTab({ onClose }: { onClose: () => void }) {
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
      onClose();
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
        : s,
    );
  };

  const removeEnvVar = (key: string) => {
    setLocalSettings((s) => {
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

      {/* Provider selector */}
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
                : s,
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

      {/* Provider-specific env vars */}
      {hints.length > 0 && (
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
                style={{ color: "var(--error)" }}
              >
                x
              </button>
            </div>
          ))}
        <AddEnvVarRow onAdd={(k, v) => setEnvVar(k, v)} />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
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
  );
}

function McpTab() {
  const { mcpServers, loadMcpServers, addMcpServer, removeMcpServer, error } =
    useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newScope, setNewScope] = useState<McpScope>("global");
  const [newEnvPairs, setNewEnvPairs] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    loadMcpServers();
  }, [loadMcpServers]);

  const handleAdd = async () => {
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
      {mcpServers.length === 0 ? (
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
                className="text-xs"
                style={{ color: "var(--error)" }}
              >
                x
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
            {(["global", "project"] as McpScope[]).map((scope) => (
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
                  style={{ color: "var(--error)" }}
                >
                  x
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
          className="rounded px-3 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          + Add MCP Server
        </button>
      )}
    </div>
  );
}

function MigrationTab() {
  const { cursorDetected, checkCursorConfig, importCursor } =
    useSettingsStore();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CursorMigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkCursorConfig();
  }, [checkCursorConfig]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importCursor();
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Cursor migration */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Import from Cursor
        </label>
        <div
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full`}
              style={{
                backgroundColor:
                  cursorDetected === null
                    ? "var(--text-muted)"
                    : cursorDetected
                      ? "var(--success)"
                      : "var(--text-muted)",
              }}
            />
            <span style={{ color: "var(--text-primary)" }}>
              {cursorDetected === null
                ? "Checking..."
                : cursorDetected
                  ? "Cursor config detected at ~/.cursor/mcp.json"
                  : "No Cursor config found"}
            </span>
          </div>

          {result ? (
            <div className="text-xs" style={{ color: "var(--success)" }}>
              Imported {result.mcpServersImported} of{" "}
              {result.mcpServersFound} MCP servers.
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={!cursorDetected || importing}
              className="rounded px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
                opacity: !cursorDetected || importing ? 0.5 : 1,
              }}
            >
              {importing ? "Importing..." : "Import MCP Servers"}
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Imports MCP server configurations from Cursor into Claude Code.
      </div>
    </div>
  );
}

function AddEnvVarRow({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (!key.trim()) return;
    onAdd(key.trim(), value);
    setKey("");
    setValue("");
  };

  return (
    <div className="mt-1 flex gap-1">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="KEY"
        className="w-24 rounded px-1.5 py-0.5 font-mono text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value"
        className="flex-1 rounded px-1.5 py-0.5 font-mono text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <button
        onClick={handleAdd}
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
  );
}
