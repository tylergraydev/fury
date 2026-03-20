import { useEffect, useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import { useLspStore } from "../../../stores/lspStore";

export function CodeIntelTab() {
  const catalog = useLspStore((s) => s.catalog);
  const installedPlugins = useLspStore((s) => s.installedPlugins);
  const loading = useLspStore((s) => s.loading);
  const error = useLspStore((s) => s.error);
  const installingPlugins = useLspStore((s) => s.installingPlugins);
  const loadCatalog = useLspStore((s) => s.loadCatalog);
  const loadInstalledPlugins = useLspStore((s) => s.loadInstalledPlugins);
  const installPlugin = useLspStore((s) => s.installPlugin);
  const uninstallPlugin = useLspStore((s) => s.uninstallPlugin);

  const [localError, setLocalError] = useState<string | null>(null);
  const [installScope, setInstallScope] = useState<string>("user");

  useEffect(() => {
    loadCatalog();
    loadInstalledPlugins();
  }, [loadCatalog, loadInstalledPlugins]);

  const installedNames = new Set(installedPlugins.map((p) => p.name));
  const availablePlugins = catalog.filter(
    (entry) => !installedNames.has(entry.pluginName),
  );

  const handleInstall = async (pluginName: string) => {
    setLocalError(null);
    try {
      await installPlugin(pluginName, installScope);
    } catch (e) {
      setLocalError(String(e));
    }
  };

  const handleUninstall = async (pluginName: string, scope: string) => {
    setLocalError(null);
    try {
      await uninstallPlugin(pluginName, scope);
    } catch (e) {
      setLocalError(String(e));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
          LSP plugins give Claude Code diagnostics after edits, jump-to-definition,
          find-references, and type info — the same intelligence VS Code gets from
          language servers.
        </div>
      </div>

      {(error || localError) && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {localError || error}
        </div>
      )}

      {/* Installed plugins */}
      <div>
        <h3
          className="text-xs font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Installed
        </h3>
        {loading ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Loading plugins…
          </div>
        ) : installedPlugins.length === 0 ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            No LSP plugins installed.
          </div>
        ) : (
          <div className="space-y-1">
            {installedPlugins.map((plugin) => (
              <div
                key={`${plugin.scope}-${plugin.name}`}
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
                  {plugin.name}
                </span>
                <span
                  className="rounded px-1 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-muted)",
                  }}
                >
                  {plugin.scope}
                </span>
                {plugin.binaryFound ? (
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--success, #4ade80)" }}>
                    <Check className="h-3 w-3" />
                    Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--warning, #facc15)" }}>
                    <AlertTriangle className="h-3 w-3" />
                    <span className="truncate">
                      Binary not found — {plugin.installHint}
                    </span>
                  </span>
                )}
                <span className="flex-1" />
                <button
                  onClick={() => handleUninstall(plugin.name, plugin.scope)}
                  className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--error)" }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available plugins */}
      {availablePlugins.length > 0 && (
        <div>
          <h3
            className="text-xs font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Available
          </h3>
          <div className="mb-2 flex gap-4 text-xs">
            {(["user", "project"] as const).map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-1"
                style={{ color: "var(--text-primary)" }}
              >
                <input
                  type="radio"
                  name="lspInstallScope"
                  checked={installScope === scope}
                  onChange={() => setInstallScope(scope)}
                />
                {scope.charAt(0).toUpperCase() + scope.slice(1)}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            {availablePlugins.map((entry) => {
              const isInstalling = installingPlugins.includes(entry.pluginName);
              return (
                <div
                  key={entry.pluginName}
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
                    {entry.language}
                  </span>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {entry.pluginName}
                  </span>
                  <span className="flex-1" />
                  <span
                    className="text-[10px] truncate max-w-48"
                    style={{ color: "var(--text-muted)" }}
                  >
                    requires: {entry.binaryName}
                  </span>
                  <button
                    onClick={() => handleInstall(entry.pluginName)}
                    disabled={isInstalling}
                    className="rounded px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--bg-primary)",
                      opacity: isInstalling ? 0.5 : 1,
                    }}
                  >
                    {isInstalling ? "Installing…" : "Install"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
