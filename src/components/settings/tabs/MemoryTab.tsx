import { useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { MemPalaceStatus } from "../../../lib/tauri/bindings.generated";

export function MemoryTab() {
  const { appSettings, loadSettings, saveSettings } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [mempalaceStatus, setMempalaceStatus] = useState<MemPalaceStatus | null>(null);
  const [mempalaceLoading, setMempalaceLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const refreshStatus = useCallback(async () => {
    setMempalaceLoading(true);
    try {
      const { commands } = await import("../../../lib/tauri/bindings.generated");
      const result = await commands.checkMempalaceStatus();
      if (result.status === "ok") {
        setMempalaceStatus(result.data);
      }
    } catch {
      // ignore
    } finally {
      setMempalaceLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  if (!appSettings) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const mpEnabled = appSettings.mempalace?.enabled ?? true;

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      await saveSettings({
        ...appSettings,
        mempalace: {
          ...appSettings.mempalace,
          enabled: !mpEnabled,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInstall = async () => {
    setActionMessage("Installing...");
    try {
      const { commands } = await import("../../../lib/tauri/bindings.generated");
      const result = await commands.installMempalacePackage();
      if (result.status === "ok") {
        setActionMessage(`Installed: ${result.data}`);
      } else {
        setActionMessage(`Error: ${result.error}`);
      }
      await refreshStatus();
    } catch {
      setActionMessage("Install failed");
    }
  };

  const handleInitialize = async () => {
    setActionMessage("Initializing palace...");
    try {
      const { commands } = await import("../../../lib/tauri/bindings.generated");
      const result = await commands.initializeMempalacePalace();
      if (result.status === "ok") {
        setActionMessage("Palace initialized");
      } else {
        setActionMessage(`Error: ${result.error}`);
      }
      await refreshStatus();
    } catch {
      setActionMessage("Initialization failed");
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setActionMessage("Migrating snapshots...");
    try {
      const { commands } = await import("../../../lib/tauri/bindings.generated");
      const result = await commands.migrateMemoryToMempalace();
      if (result.status === "ok") {
        setActionMessage(result.data > 0 ? `Migrated ${result.data} snapshots` : "No snapshots to migrate");
      } else {
        setActionMessage(`Error: ${result.error}`);
      }
    } catch {
      setActionMessage("Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Fury remembers context across sessions using a 3-layer memory system: automatic context injection, observation hooks, and semantic search via MemPalace.
      </div>

      {/* Memory System Toggle */}
      <Section title="MemPalace">
        <div className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
          Semantic memory search powered by ChromaDB. When enabled, agents can search and store memories using vector similarity instead of keyword matching.
        </div>

        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={mpEnabled}
            onChange={toggleEnabled}
            disabled={saving}
          />
          Enable MemPalace
        </label>
      </Section>

      {/* Status */}
      {mpEnabled && (
        <Section title="Status">
          {mempalaceLoading ? (
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Checking...
            </div>
          ) : mempalaceStatus ? (
            <div className="space-y-1.5">
              <StatusRow
                label="Python"
                ok={mempalaceStatus.pythonAvailable}
                detail={mempalaceStatus.pythonCommand}
              />
              <StatusRow
                label="MemPalace"
                ok={mempalaceStatus.mempalaceInstalled}
                detail={mempalaceStatus.mempalaceVersion}
              />
              <StatusRow
                label="Palace"
                ok={mempalaceStatus.palaceInitialized}
                detail={mempalaceStatus.palacePath}
              />
            </div>
          ) : (
            <button
              className="text-[10px] px-2 py-1 rounded"
              style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
              onClick={refreshStatus}
            >
              Check Status
            </button>
          )}

          {actionMessage && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {actionMessage}
            </div>
          )}
        </Section>
      )}

      {/* Actions */}
      {mpEnabled && mempalaceStatus && (
        <Section title="Setup">
          <div className="flex flex-wrap gap-2">
            {!mempalaceStatus.mempalaceInstalled && mempalaceStatus.pythonAvailable && (
              <ActionButton onClick={handleInstall} disabled={!!actionMessage && actionMessage.endsWith("...")}>
                Install MemPalace
              </ActionButton>
            )}

            {mempalaceStatus.mempalaceInstalled && !mempalaceStatus.palaceInitialized && (
              <ActionButton onClick={handleInitialize} disabled={!!actionMessage && actionMessage.endsWith("...")}>
                Initialize Palace
              </ActionButton>
            )}

            {mempalaceStatus.mempalaceInstalled && mempalaceStatus.palaceInitialized && (
              <ActionButton onClick={handleMigrate} disabled={migrating}>
                {migrating ? "Migrating..." : "Migrate Existing Memory"}
              </ActionButton>
            )}

            <ActionButton onClick={refreshStatus} disabled={mempalaceLoading} secondary>
              Refresh Status
            </ActionButton>
          </div>
        </Section>
      )}

      {/* Configuration */}
      {mpEnabled && (
        <Section title="Configuration">
          <label className="block mb-2">
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              Palace Path
            </span>
            <input
              className="mt-1 block w-full rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder={mempalaceStatus?.palacePath ?? "~/.mempalace/palace"}
              value={appSettings.mempalace?.palacePath ?? ""}
              onChange={async (e) => {
                const val = e.target.value || null;
                await saveSettings({
                  ...appSettings,
                  mempalace: {
                    ...appSettings.mempalace,
                    enabled: mpEnabled,
                    palacePath: val,
                  },
                });
              }}
            />
          </label>
          <label className="block">
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              Python Command
            </span>
            <input
              className="mt-1 block w-full rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder="python3 (auto-detected)"
              value={appSettings.mempalace?.pythonCommand ?? ""}
              onChange={async (e) => {
                const val = e.target.value || null;
                await saveSettings({
                  ...appSettings,
                  mempalace: {
                    ...appSettings.mempalace,
                    enabled: mpEnabled,
                    pythonCommand: val,
                  },
                });
              }}
            />
          </label>
        </Section>
      )}

      {/* How It Works */}
      <Section title="How Memory Works">
        <div className="space-y-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <div>
            <strong style={{ color: "var(--text-secondary)" }}>Layer 1 &mdash; Context Injection:</strong>{" "}
            Compressed memory snapshots are prepended to the system prompt each session (~2-3K tokens).
          </div>
          <div>
            <strong style={{ color: "var(--text-secondary)" }}>Layer 2 &mdash; Observation Hooks:</strong>{" "}
            Tool results are automatically analyzed to extract decisions, patterns, errors, and file changes. Zero token cost.
          </div>
          <div>
            <strong style={{ color: "var(--text-secondary)" }}>Layer 3 &mdash; Semantic Search:</strong>{" "}
            {mpEnabled
              ? "MemPalace provides 19 tools for semantic search, knowledge graph queries, and palace navigation via ChromaDB."
              : "Basic keyword search via SQLite (enable MemPalace for semantic vector search)."}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded p-3"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string | null }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span style={{ color: ok ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)" }}>
        {ok ? "\u2713" : "\u2717"}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {detail && (
        <span className="truncate" style={{ color: "var(--text-muted)" }}>{detail}</span>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  secondary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="text-[10px] px-2 py-1 rounded"
      style={{
        backgroundColor: secondary ? "var(--bg-hover)" : "var(--accent)",
        color: secondary ? "var(--text-secondary)" : "var(--text-on-accent, #fff)",
        opacity: disabled ? 0.5 : 1,
      }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
