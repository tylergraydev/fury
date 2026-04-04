import { useEffect, useState } from "react";
import {
  type RepoSettings,
  type ProviderType,
  getRepoSettings,
  updateRepoSettings,
  detectDevcontainer,
} from "../../lib/tauri";
import { WorkspaceTemplateDialog } from "../workspace/WorkspaceTemplateDialog";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";
import ContainerizePanel from "../devcontainer/ContainerizePanel";

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

interface RepoSettingsPanelProps {
  repoId: string;
  repoName: string;
  onClose: () => void;
  workspaceId?: string;
}

export function RepoSettingsPanel({
  repoId,
  repoName,
  onClose,
  workspaceId,
}: RepoSettingsPanelProps) {
  const [settings, setSettings] = useState<RepoSettings>({
    setupScript: null,
    runScript: null,
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: {},
    worktreeBasePath: null,
    providerOverride: null,
    devcontainer: null,
  });
  const [showProviderKeys, setShowProviderKeys] = useState<Record<string, boolean>>({});
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [detectedDevcontainer, setDetectedDevcontainer] = useState<string | null>(null);
  const templates = useWorkspaceTemplateStore((s) => s.templates);
  const loadTemplates = useWorkspaceTemplateStore((s) => s.loadTemplates);
  const deleteTemplate = useWorkspaceTemplateStore((s) => s.deleteTemplate);

  useEffect(() => {
    getRepoSettings(repoId)
      .then(setSettings)
      .catch((e) => setError(String(e)));
    loadTemplates(repoId);
    detectDevcontainer(repoId)
      .then(setDetectedDevcontainer)
      .catch(() => setDetectedDevcontainer(null));
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
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Settings: ${repoName}`}
        className="flex w-[500px] max-w-[90vw] max-h-[80vh] flex-col rounded-lg"
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
            className="text-sm font-semibold min-w-0"
            style={{ color: "var(--text-primary)" }}
          >
            Settings: <span className="truncate">{repoName}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close settings"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs break-words"
              style={{
                backgroundColor: "var(--error-bg)",
                color: "var(--error)",
                border: "1px solid var(--error-border)",
              }}
            >
              {error}
            </div>
          )}

          {/* Worktree location */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Worktree Location
            </label>
            <input
              value={settings.worktreeBasePath ?? ""}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  worktreeBasePath: e.target.value || null,
                }))
              }
              placeholder="Default: .claude/worktrees/ (inside repo)"
              className="w-full rounded px-2 py-1.5 font-mono text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Base directory for worktrees (repo name is appended
              automatically). Leave empty to use the default (next to the
              repo).
            </p>
          </div>

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

          {/* Provider Override */}
          <div>
            <label
              className="mb-1 flex items-center gap-2 text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={settings.providerOverride !== null}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSettings((s) => ({
                      ...s,
                      providerOverride: {
                        providerType: "Anthropic",
                        envVars: {},
                      },
                    }));
                  } else {
                    setSettings((s) => ({ ...s, providerOverride: null }));
                  }
                }}
              />
              Override Provider for this Repository
            </label>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Use a different API key or provider for this repo instead of the
              global setting.
            </p>
            {settings.providerOverride && (
              <div
                className="mt-2 space-y-3 rounded p-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <label
                    className="mb-0.5 block text-[10px] font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Provider
                  </label>
                  <select
                    value={settings.providerOverride.providerType}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        providerOverride: {
                          ...s.providerOverride!,
                          providerType: e.target.value as ProviderType,
                        },
                      }))
                    }
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-primary)",
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
                {PROVIDER_ENV_HINTS[settings.providerOverride.providerType].map(
                  (key) => (
                    <div key={key}>
                      <label
                        className="mb-0.5 block text-[10px] font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {key}
                      </label>
                      <div className="flex gap-1">
                        <input
                          type={showProviderKeys[key] ? "text" : "password"}
                          value={
                            settings.providerOverride!.envVars[key] ?? ""
                          }
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              providerOverride: {
                                ...s.providerOverride!,
                                envVars: {
                                  ...s.providerOverride!.envVars,
                                  [key]: e.target.value,
                                },
                              },
                            }))
                          }
                          placeholder={`Enter ${key}`}
                          className="flex-1 rounded px-2 py-1 font-mono text-xs"
                          style={{
                            backgroundColor: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        />
                        <button
                          onClick={() =>
                            setShowProviderKeys((s) => ({
                              ...s,
                              [key]: !s[key],
                            }))
                          }
                          className="rounded px-2 py-1 text-[10px]"
                          style={{
                            backgroundColor: "var(--bg-primary)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {showProviderKeys[key] ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Dev Container */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Dev Container
            </label>
            {/* Quick containerize option */}
            {workspaceId && !settings.devcontainer?.enabled && (
              <ContainerizePanel
                workspaceId={workspaceId}
                existingDevcontainer={detectedDevcontainer}
                onContainerized={() => {
                  getRepoSettings(repoId).then(setSettings).catch(() => {});
                }}
              />
            )}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                <input
                  type="checkbox"
                  checked={settings.devcontainer?.enabled ?? false}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      devcontainer: {
                        ...(s.devcontainer ?? {
                          enabled: false,
                          backend: "devcontainerCli" as const,
                          agentExecMode: "host" as const,
                          image: null,
                          composeFile: null,
                          composeService: null,
                          devcontainerPath: null,
                          containerWorkspacePath: null,
                          extraDockerArgs: [],
                          containerEnvVars: {},
                        }),
                        enabled: e.target.checked,
                      },
                    }))
                  }
                />
                Enable dev container for new workspaces
              </label>
              {settings.devcontainer?.enabled && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] w-20" style={{ color: "var(--text-secondary)" }}>Backend</label>
                    <select
                      value={settings.devcontainer.backend}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          devcontainer: {
                            ...s.devcontainer!,
                            backend: e.target.value as "devcontainerCli" | "rawDocker",
                          },
                        }))
                      }
                      className="rounded px-2 py-1 text-xs flex-1"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <option value="devcontainerCli">devcontainer CLI</option>
                      <option value="rawDocker">Raw Docker</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] w-20" style={{ color: "var(--text-secondary)" }}>Agent exec</label>
                    <select
                      value={settings.devcontainer.agentExecMode}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          devcontainer: {
                            ...s.devcontainer!,
                            agentExecMode: e.target.value as "host" | "container",
                          },
                        }))
                      }
                      className="rounded px-2 py-1 text-xs flex-1"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <option value="host">Host (default)</option>
                      <option value="container">Container</option>
                    </select>
                  </div>
                  {settings.devcontainer.devcontainerPath && (
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Detected: {settings.devcontainer.devcontainerPath}
                    </div>
                  )}
                  {settings.devcontainer.backend === "rawDocker" && (
                    <input
                      type="text"
                      placeholder="Docker image (e.g. node:20)"
                      value={settings.devcontainer.image ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          devcontainer: {
                            ...s.devcontainer!,
                            image: e.target.value || null,
                          },
                        }))
                      }
                      className="w-full rounded px-2 py-1 text-xs"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Workspace Templates */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Workspace Templates
            </label>
            {templates.length > 0 && (
              <div className="mb-2 space-y-1">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded px-2 py-1.5"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t.name}
                      </div>
                      {t.description && (
                        <div
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {t.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="ml-2 text-xs"
                      style={{ color: "var(--error)" }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowTemplateDialog(true)}
              className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Save Current Settings as Template
            </button>
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
      {showTemplateDialog && (
        <WorkspaceTemplateDialog
          repoId={repoId}
          onClose={() => {
            setShowTemplateDialog(false);
            loadTemplates(repoId);
          }}
        />
      )}
    </div>
  );
}
