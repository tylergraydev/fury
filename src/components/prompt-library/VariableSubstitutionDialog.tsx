import { useState, useMemo } from "react";
import { X, Zap } from "lucide-react";
import type { Prompt } from "../../lib/tauri";
import {
  extractVariables,
  substituteVariables,
  isAutoFillVariable,
} from "../../lib/promptVariables";

interface Props {
  prompt: Prompt;
  onClose: () => void;
  onInsert: (resolvedContent: string) => void;
  currentFilePath?: string | null;
  currentSelection?: string | null;
  currentBranch?: string | null;
  currentWorkspace?: string | null;
}

export function VariableSubstitutionDialog({
  prompt,
  onClose,
  onInsert,
  currentFilePath,
  currentSelection,
  currentBranch,
  currentWorkspace,
}: Props) {
  const variables = useMemo(
    () => extractVariables(prompt.content),
    [prompt.content],
  );

  const autoFillDefaults = useMemo(() => {
    const defaults: Record<string, string> = {};
    if (currentFilePath) defaults.file = currentFilePath;
    if (currentSelection) defaults.selection = currentSelection;
    if (currentBranch) defaults.branch = currentBranch;
    if (currentWorkspace) defaults.workspace = currentWorkspace;
    return defaults;
  }, [currentFilePath, currentSelection, currentBranch, currentWorkspace]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of variables) {
      initial[v] = autoFillDefaults[v] ?? "";
    }
    return initial;
  });

  const handleInsert = () => {
    const resolved = substituteVariables(prompt.content, values);
    onInsert(resolved);
  };

  const allFilled = variables.every((v) => values[v]?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[450px] max-w-[90vw] max-h-[80vh] flex-col rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Variable substitution"
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
            <Zap size={14} style={{ color: "var(--accent)" }} />
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Fill Variables
            </h2>
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {prompt.name}
            </span>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Preview */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Template
            </label>
            <div
              className="rounded px-2 py-1.5 font-mono text-xs whitespace-pre-wrap"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {prompt.content}
            </div>
          </div>

          {/* Variable inputs */}
          {variables.map((varName) => (
            <div key={varName}>
              <label
                className="mb-1 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                <span className="font-mono" style={{ color: "var(--accent)" }}>
                  {`{{${varName}}}`}
                </span>
                {isAutoFillVariable(varName) && autoFillDefaults[varName] && (
                  <span style={{ color: "var(--text-muted)" }}>(auto-filled)</span>
                )}
              </label>
              <input
                /* v8 ignore start -- defensive; state always includes all keys */
                value={values[varName] ?? ""}
                /* v8 ignore stop */
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [varName]: e.target.value }))
                }
                placeholder={`Enter value for ${varName}`}
                className="w-full rounded px-2 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                autoFocus={
                  !isAutoFillVariable(varName) ||
                  !autoFillDefaults[varName]
                }
              />
            </div>
          ))}
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
            onClick={handleInsert}
            disabled={!allFilled}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              opacity: allFilled ? 1 : 0.5,
            }}
          >
            Insert Prompt
          </button>
        </div>
      </div>
    </div>
  );
}
