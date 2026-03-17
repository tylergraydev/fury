import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getRepoSettings, type RepoSettings } from "../../lib/tauri";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";

interface Props {
  repoId: string;
  onClose: () => void;
}

export function WorkspaceTemplateDialog({ repoId, onClose }: Props) {
  const { createTemplate } = useWorkspaceTemplateStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [setupScript, setSetupScript] = useState("");
  const [runScript, setRunScript] = useState("");
  const [archiveScript, setArchiveScript] = useState("");
  const [runScriptMode, setRunScriptMode] = useState<
    "nonconcurrent" | "concurrent"
  >("nonconcurrent");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [sparseDirs, setSparseDirs] = useState("");
  const [autoCommit, setAutoCommit] = useState(true);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from current repo settings
  useEffect(() => {
    getRepoSettings(repoId)
      .then((s: RepoSettings) => {
        setSetupScript(s.setupScript ?? "");
        setRunScript(s.runScript ?? "");
        setArchiveScript(s.archiveScript ?? "");
        setRunScriptMode(s.runScriptMode);
        setEnvVars(s.envVars);
      })
      .catch(() => {});
  }, [repoId]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTemplate({
        repoId,
        name: name.trim(),
        description: description.trim() || undefined,
        setupScript: setupScript.trim() || undefined,
        runScript: runScript.trim() || undefined,
        archiveScript: archiveScript.trim() || undefined,
        runScriptMode,
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
        sparseDirs: sparseDirs.trim()
          ? sparseDirs
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : undefined,
        autoCommit,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    setEnvVars((v) => ({ ...v, [newEnvKey.trim()]: newEnvValue }));
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const removeEnvVar = (key: string) => {
    setEnvVars((v) => {
      const { [key]: _, ...rest } = v;
      return rest;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[500px] max-w-[90vw] max-h-[80vh] flex-col rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Workspace template"
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
            Save as Template
          </h2>
          <button
            onClick={onClose}
            style={{ color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="text-xs" style={{ color: "var(--error)" }}>
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Template Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. frontend-feature"
              className="w-full rounded px-2 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded px-2 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Scripts */}
          {(
            [
              ["setup", setupScript, setSetupScript],
              ["run", runScript, setRunScript],
              ["archive", archiveScript, setArchiveScript],
            ] as const
          ).map(([kind, value, setter]) => (
            <div key={kind}>
              <label
                className="mb-1 block text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {kind.charAt(0).toUpperCase() + kind.slice(1)} Script
              </label>
              <textarea
                value={value}
                onChange={(e) => setter(e.target.value)}
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
          ))}

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
                    checked={runScriptMode === mode}
                    onChange={() => setRunScriptMode(mode)}
                  />
                  {mode === "nonconcurrent"
                    ? "Nonconcurrent (kill previous)"
                    : "Concurrent"}
                </label>
              ))}
            </div>
          </div>

          {/* Sparse dirs */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Sparse Checkout Directories
            </label>
            <input
              value={sparseDirs}
              onChange={(e) => setSparseDirs(e.target.value)}
              placeholder="src, tests (comma-separated)"
              className="w-full rounded px-2 py-1.5 font-mono text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Auto-commit */}
          <label
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-primary)" }}
          >
            <input
              type="checkbox"
              checked={autoCommit}
              onChange={(e) => setAutoCommit(e.target.checked)}
            />
            Auto-commit enabled
          </label>

          {/* Environment variables */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Environment Variables
            </label>
            {Object.entries(envVars).map(([key, value]) => (
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
                  <X size={12} />
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
            disabled={saving || !name.trim()}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
