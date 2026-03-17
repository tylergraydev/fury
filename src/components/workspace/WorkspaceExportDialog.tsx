import { useState } from "react";
import { Download, X, AlertTriangle } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { exportWorkspace } from "../../lib/tauri";
import { useToastStore } from "../../stores/toastStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface Props {
  workspaceId: string;
  onClose: () => void;
}

export function WorkspaceExportDialog({ workspaceId, onClose }: Props) {
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  );
  const [includeChat, setIncludeChat] = useState(true);
  const [includeTodos, setIncludeTodos] = useState(true);
  const [includeRepoSettings, setIncludeRepoSettings] = useState(true);
  const [includeEnvVars, setIncludeEnvVars] = useState(false);
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeSnippets, setIncludeSnippets] = useState(true);
  const [exporting, setExporting] = useState(false);

  const workspaceName = workspace?.name ?? "workspace";

  const handleExport = async () => {
    try {
      const filePath = await save({
        defaultPath: `${workspaceName}.fury-workspace.json`,
        filters: [{ name: "Fury Workspace", extensions: ["json"] }],
      });
      if (!filePath) return;

      setExporting(true);
      const json = await exportWorkspace({
        workspaceId,
        includeChat,
        includeTodos,
        includeRepoSettings,
        includeEnvVars: includeRepoSettings && includeEnvVars,
        includeBookmarks,
        includeSnippets,
      });

      await writeTextFile(filePath, json);
      useToastStore.getState().addToast("Workspace exported successfully", "success");
      onClose();
    } catch (e) {
      useToastStore.getState().addToast(`Export failed: ${e}`, "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[480px] max-w-[90vw] flex-col rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Export workspace"
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
          <div className="flex items-center gap-2">
            <Download size={14} style={{ color: "var(--text-secondary)" }} />
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Export Workspace
            </h2>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Choose which data to include in the export bundle for{" "}
            <strong style={{ color: "var(--text-primary)" }}>{workspaceName}</strong>.
          </p>

          <div className="space-y-2">
            <Checkbox
              label="Conversation History"
              checked={includeChat}
              onChange={setIncludeChat}
            />
            <Checkbox
              label="Todos"
              checked={includeTodos}
              onChange={setIncludeTodos}
            />
            <Checkbox
              label="Repository Settings"
              sublabel="Scripts, test config"
              checked={includeRepoSettings}
              onChange={setIncludeRepoSettings}
            />
            {includeRepoSettings && (
              <div className="ml-5 space-y-1.5">
                <Checkbox
                  label="Include environment variables"
                  checked={includeEnvVars}
                  onChange={setIncludeEnvVars}
                />
                <div
                  className="flex items-start gap-1.5 rounded px-2 py-1.5"
                  style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
                >
                  <AlertTriangle
                    size={12}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--warning)" }}
                  />
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--warning)" }}
                  >
                    Environment variables may contain secrets (API keys, tokens).
                    Exclude them if sharing externally.
                  </span>
                </div>
              </div>
            )}
            <Checkbox
              label="File Bookmarks"
              sublabel="Repo-scoped"
              checked={includeBookmarks}
              onChange={setIncludeBookmarks}
            />
            <Checkbox
              label="Code Snippets"
              sublabel="All snippets, not workspace-specific"
              checked={includeSnippets}
              onChange={setIncludeSnippets}
            />
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
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: exporting ? 0.5 : 1,
            }}
          >
            <Download size={12} />
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)]"
      />
      <span className="text-xs" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      {sublabel && (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          ({sublabel})
        </span>
      )}
    </label>
  );
}
