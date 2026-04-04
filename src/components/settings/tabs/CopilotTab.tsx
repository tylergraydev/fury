import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useCopilotStore } from "../../../stores/copilotStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";

export function CopilotTab() {
  const appSettings = useSettingsStore((s) => s.appSettings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const connectionStatus = useCopilotStore((s) => s.connectionStatus);
  const authStatus = useCopilotStore((s) => s.authStatus);
  const signInResult = useCopilotStore((s) => s.signInResult);
  const copilotError = useCopilotStore((s) => s.error);
  const initialize = useCopilotStore((s) => s.initialize);
  const shutdown = useCopilotStore((s) => s.shutdown);
  const signIn = useCopilotStore((s) => s.signIn);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeRepoId = useWorkspaceStore((s) => s.activeRepoId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const repositories = useRepositoryStore((s) => s.repositories);
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
        const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
        const repo = activeWs
          ? repositories.find((r) => r.id === activeWs.repoId)
          : repositories.find((r) => activeRepoId === r.id);
        if (repo) {
          await initialize(`file://${repo.path}`);
        }
      } else {
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
      /* v8 ignore start -- fallback when Tauri shell plugin unavailable */
      globalThis.window?.open(uri, "_blank");
      /* v8 ignore stop */
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
