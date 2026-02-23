import { useEffect, useState } from "react";
import {
  X,
  Key,
  Server,
  ArrowLeftRight,
  FlaskConical,
  Download,
  Plus,
  Palette,
  Sparkles,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { getThemeNames, type ThemeName } from "../../lib/themes";
import type {
  AppSettings,
  ProviderType,
  McpScope,
  CursorMigrationResult,
  CursorRulesImportResult,
} from "../../lib/tauri";
import { detectCursorrules, importCursorrules } from "../../lib/tauri";
import { useCopilotStore } from "../../stores/copilotStore";
import { isMac } from "../../lib/keybindings";

type SettingsTab = "appearance" | "provider" | "copilot" | "mcp" | "migration" | "experimental" | "updates";

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

const NAV_ITEMS: { tab: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tab: "appearance", label: "Appearance", icon: Palette },
  { tab: "provider", label: "Provider", icon: Key },
  { tab: "copilot", label: "Copilot", icon: Sparkles },
  { tab: "mcp", label: "MCP Servers", icon: Server },
  { tab: "migration", label: "Migration", icon: ArrowLeftRight },
  { tab: "experimental", label: "Experimental", icon: FlaskConical },
  { tab: "updates", label: "Updates", icon: Download },
];

// Theme display metadata (must stay in sync with themes.ts definitions)
const THEME_META: Record<ThemeName, { label: string; description: string; swatches: string[] }> = {
  blend: {
    label: "Blend",
    description: "Black base with blue accents",
    swatches: ["#000000", "#161b22", "#3b82f6", "#f0f6fc"],
  },
  midnight: {
    label: "Midnight",
    description: "Pure black with white accents",
    swatches: ["#000000", "#1a1a1a", "#ffffff", "#4ade80"],
  },
  github: {
    label: "GitHub Dark",
    description: "GitHub's dark default palette",
    swatches: ["#0d1117", "#1c2128", "#3b82f6", "#f0f6fc"],
  },
};

export function AppSettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const closeSettings = () => useUIStore.getState().closeViewTab("settings");

  return (
    <div
      className="flex h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Sidebar navigation */}
      <div
        className="flex h-full w-48 flex-shrink-0 flex-col"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{
            borderBottom: "1px solid var(--border)",
            /* v8 ignore next -- @preserve */
            paddingTop: isMac ? 42 : 12,
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Settings
          </h2>
          <button
            onClick={closeSettings}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition-colors"
              style={{
                backgroundColor: activeTab === tab ? "var(--bg-surface)" : "transparent",
                color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
                borderLeft: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "provider" && <ProviderTab />}
        {activeTab === "copilot" && <CopilotTab />}
        {activeTab === "mcp" && <McpTab />}
        {activeTab === "migration" && <MigrationTab />}
        {activeTab === "experimental" && <ExperimentalTab />}
        {activeTab === "updates" && <UpdatesTab />}
      </div>
    </div>
  );
}

function AppearanceTab() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const { appSettings, saveSettings, loadSettings } = useSettingsStore();
  const themeNames = getThemeNames();

  useEffect(() => {
    if (!appSettings) loadSettings();
  }, [appSettings, loadSettings]);

  const handleSetTheme = (name: ThemeName) => {
    setTheme(name);
    if (appSettings) {
      saveSettings({ ...appSettings, theme: name }).catch(() => {});
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <label
          className="mb-3 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Theme
        </label>
        <div className="grid grid-cols-3 gap-3">
          {themeNames.map((name) => {
            const meta = THEME_META[name];
            const isActive = theme === name;
            return (
              <button
                key={name}
                onClick={() => handleSetTheme(name)}
                className="rounded-lg p-3 text-left transition-colors"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: isActive
                    ? "2px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
              >
                <div className="mb-2 flex gap-1">
                  {meta.swatches.map((color, i) => (
                    <div
                      key={i}
                      className="h-5 flex-1 rounded"
                      style={{
                        backgroundColor: color,
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                  ))}
                </div>
                <div
                  className="text-xs font-medium"
                  style={{
                    color: isActive ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {meta.label}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {meta.description}
                </div>
                {isActive && (
                  <div
                    className="mt-1.5 text-[10px] font-medium"
                    style={{ color: "var(--accent)" }}
                  >
                    Active
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProviderTab() {
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

function CopilotTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const {
    connectionStatus,
    authStatus,
    signInResult,
    error: copilotError,
    initialize,
    shutdown,
    signIn,
  } = useCopilotStore();
  const { activeWorkspaceId, activeRepoId, workspaces } = useWorkspaceStore();
  const { repositories } = useRepositoryStore();
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

  const enabled = appSettings.copilot?.enabled ?? false;

  const handleToggle = async () => {
    setSaving(true);
    try {
      const newSettings = {
        ...appSettings,
        copilot: { ...appSettings.copilot, enabled: !enabled },
      };
      await saveSettings(newSettings);

      if (!enabled) {
        // Turning on — start the LS with the active repo's root URI
        const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
        const repo = activeWs
          ? repositories.find((r) => r.id === activeWs.repoId)
          : repositories.find((r) => activeRepoId === r.id);
        if (repo) {
          await initialize(`file://${repo.path}`);
        }
      } else {
        // Turning off — stop the LS
        await shutdown();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignIn = async () => {
    await signIn();
  };

  const handleOpenGitHub = async () => {
    // Copy user code to clipboard before opening GitHub – button only renders when userCode is truthy
    /* v8 ignore next -- @preserve */
    if (signInResult?.userCode) {
      try {
        await navigator.clipboard.writeText(signInResult.userCode);
      } catch {
        // Best-effort
      }
    }
    const uri = signInResult?.verificationUri ?? "https://github.com/login/device";
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(uri);
    } catch {
      window.open(uri, "_blank");
    }
  };

  const statusColor =
    connectionStatus === "connected"
      ? "var(--success)"
      : connectionStatus === "connecting"
        ? "var(--accent)"
        : connectionStatus === "error"
          ? "var(--error)"
          : "var(--text-muted)";

  const statusLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : connectionStatus === "error"
          ? "Error"
          : "Disconnected";

  // Extract user from auth status
  const authUser =
    authStatus && typeof authStatus === "object" && "user" in (authStatus as Record<string, unknown>)
      ? String((authStatus as Record<string, string>).user)
      : null;

  return (
    <div className="p-4 space-y-4">
      {copilotError && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {copilotError}
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
            checked={enabled}
            onChange={handleToggle}
            disabled={saving}
          />
          Enable GitHub Copilot
        </label>
        <div
          className="mt-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Use your GitHub Copilot subscription for inline code completions.
          Requires Node.js and the @github/copilot-language-server package.
        </div>
      </div>

      {/* Connection status */}
      {enabled && (
        <div
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <label
            className="mb-2 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Status
          </label>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
            <span style={{ color: "var(--text-primary)" }}>
              {statusLabel}
            </span>
          </div>
          {authUser && (
            <div
              className="mt-1 text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Signed in as {authUser}
            </div>
          )}
        </div>
      )}

      {/* Sign in */}
      {enabled && connectionStatus === "connected" && !authUser && (
        <div
          className="rounded p-3 space-y-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Authentication
          </label>

          {signInResult?.userCode ? (
            <div className="space-y-2">
              <div className="text-xs" style={{ color: "var(--text-primary)" }}>
                Enter this code on GitHub:
              </div>
              <div
                className="rounded px-3 py-2 text-center font-mono text-lg font-bold tracking-widest"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--accent)",
                  border: "1px solid var(--border)",
                }}
              >
                {signInResult.userCode}
              </div>
              <button
                onClick={handleOpenGitHub}
                className="w-full rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                Copy Code & Open GitHub
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="rounded px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              Sign In with GitHub
            </button>
          )}
        </div>
      )}

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        GitHub Copilot completions appear as ghost text in the editor. Press Tab
        to accept a suggestion.
      </div>
    </div>
  );
}

function McpTab() {
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

function MigrationTab() {
  const { cursorDetected, checkCursorConfig, importCursor } =
    useSettingsStore();
  const { repositories } = useRepositoryStore();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CursorMigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cursorrules state
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [rulesDetected, setRulesDetected] = useState<boolean | null>(null);
  const [rulesImporting, setRulesImporting] = useState(false);
  const [rulesResult, setRulesResult] =
    useState<CursorRulesImportResult | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    checkCursorConfig();
  }, [checkCursorConfig]);

  useEffect(() => {
    if (selectedRepoId) {
      setRulesDetected(null);
      setRulesResult(null);
      setRulesError(null);
      detectCursorrules(selectedRepoId)
        .then(setRulesDetected)
        .catch(() => setRulesDetected(false));
    }
  }, [selectedRepoId]);

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

  const handleRulesImport = async (overwrite: boolean) => {
    /* v8 ignore next -- @preserve: button only renders when selectedRepoId is set */
    if (!selectedRepoId) return;
    setRulesImporting(true);
    setRulesError(null);
    try {
      const res = await importCursorrules(selectedRepoId, overwrite);
      setRulesResult(res);
    } catch (e) {
      setRulesError(String(e));
    } finally {
      setRulesImporting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Cursor MCP migration */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Import MCP Servers from Cursor
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
              className="h-2 w-2 rounded-full"
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

      {/* .cursorrules to CLAUDE.md conversion */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Convert .cursorrules to CLAUDE.md
        </label>
        <div
          className="space-y-2 rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <select
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">Select a repository</option>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>

          {selectedRepoId && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    rulesDetected === null
                      ? "var(--text-muted)"
                      : rulesDetected
                        ? "var(--success)"
                        : "var(--text-muted)",
                }}
              />
              <span style={{ color: "var(--text-primary)" }}>
                {rulesDetected === null
                  ? "Checking..."
                  : rulesDetected
                    ? ".cursorrules found"
                    : "No .cursorrules file in this repo"}
              </span>
            </div>
          )}

          {rulesError && (
            <div className="text-xs" style={{ color: "var(--error)" }}>
              {rulesError}
            </div>
          )}

          {rulesResult ? (
            <div
              className="text-xs"
              style={{
                color: rulesResult.written
                  ? "var(--success)"
                  : "var(--text-muted)",
              }}
            >
              {rulesResult.written
                ? `CLAUDE.md ${rulesResult.claudeMdExisted ? "merged" : "created"} at ${rulesResult.claudeMdPath}`
                : rulesResult.claudeMdExisted
                  ? "CLAUDE.md already exists. Click Merge to prepend .cursorrules content."
                  : "No .cursorrules found."}
            </div>
          ) : null}

          {rulesDetected && !rulesResult?.written && (
            <div className="flex gap-2">
              <button
                onClick={() => handleRulesImport(false)}
                disabled={rulesImporting}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                  opacity: rulesImporting ? 0.5 : 1,
                }}
              >
                {rulesImporting ? "Converting..." : "Convert to CLAUDE.md"}
              </button>
              {rulesResult?.claudeMdExisted && !rulesResult.written && (
                <button
                  onClick={() => handleRulesImport(true)}
                  disabled={rulesImporting}
                  className="rounded px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    opacity: rulesImporting ? 0.5 : 1,
                  }}
                >
                  Merge into existing CLAUDE.md
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Import MCP servers from Cursor, or convert .cursorrules files to
        CLAUDE.md format for Claude Code compatibility.
      </div>
    </div>
  );
}

function ExperimentalTab() {
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

  const toggle = async (key: "spotlightTesting" | "agentTeams" | "persistentProcesses") => {
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

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        These features are experimental and may change or be removed.
      </div>

      {/* Spotlight Testing */}
      <div
        className="rounded p-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={appSettings.experimental.spotlightTesting}
            onChange={() => toggle("spotlightTesting")}
            disabled={saving}
          />
          Spotlight Testing
        </label>
        <div
          className="mt-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Watch workspace worktree for file changes and sync them to the repo
          root in real-time. Enables running tests against the agent's changes
          without switching branches.
        </div>
      </div>

      {/* Agent Teams */}
      <div
        className="rounded p-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={appSettings.experimental.agentTeams}
            onChange={() => toggle("agentTeams")}
            disabled={saving}
          />
          Agent Teams
        </label>
        <div
          className="mt-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Make agents aware of sibling workspaces in the same repo. Sets
          CONDUCTOR_AGENT_TEAMS and CONDUCTOR_TEAM_WORKSPACES environment
          variables so agents can coordinate.
        </div>
      </div>

      {/* Performance Mode */}
      <div
        className="rounded p-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={appSettings.experimental.persistentProcesses}
            onChange={() => toggle("persistentProcesses")}
            disabled={saving}
          />
          Performance Mode
        </label>
        <div
          className="mt-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Keep Claude processes alive between turns to eliminate startup
          latency. Uses more memory per workspace. When disabled (Low RAM
          mode), a new process is spawned for each turn.
        </div>
      </div>
    </div>
  );
}

function UpdatesTab() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setStatus(`Update available: v${update.version}`);
        await update.downloadAndInstall();
        setStatus("Update installed. Restart the app to apply.");
      } else {
        setStatus("You are on the latest version.");
      }
    } catch (e) {
      setStatus(`Update check failed: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Application Updates
        </label>
        <div
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="mb-2 text-xs" style={{ color: "var(--text-primary)" }}>
            Current version: v0.1.0
          </div>
          {status && (
            <div
              className="mb-2 text-xs"
              style={{
                color: status.includes("failed")
                  ? "var(--error)"
                  : status.includes("latest")
                    ? "var(--success)"
                    : "var(--accent)",
              }}
            >
              {status}
            </div>
          )}
          <button
            onClick={checkForUpdates}
            disabled={checking}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: checking ? 0.5 : 1,
            }}
          >
            {checking ? "Checking..." : "Check for Updates"}
          </button>
        </div>
      </div>
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Updates are downloaded from GitHub Releases. Configure the updater
        endpoint in tauri.conf.json.
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
