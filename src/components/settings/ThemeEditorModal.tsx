import { useEffect, useRef, useState } from "react";
import { Copy, Upload, Trash2 } from "lucide-react";
import {
  type ThemeVars,
  builtInThemes,
  applyThemeVars,
  applyTheme,
  THEME_VAR_GROUPS,
} from "../../lib/themes";
import type { CustomTheme } from "../../lib/tauri";

/** Human-readable labels for CSS variable names */
const VAR_LABELS: Record<string, string> = {
  "--bg-primary": "Primary",
  "--bg-secondary": "Secondary",
  "--bg-surface": "Surface",
  "--bg-hover": "Hover",
  "--text-primary": "Primary",
  "--text-secondary": "Secondary",
  "--text-muted": "Muted",
  "--border": "Border",
  "--composer-border": "Composer",
  "--accent": "Accent",
  "--accent-hover": "Accent Hover",
  "--accent-green": "Green",
  "--accent-purple": "Purple",
  "--accent-orange": "Orange",
  "--success": "Success",
  "--warning": "Warning",
  "--error": "Error",
};

interface Props {
  existingTheme: CustomTheme | null;
  duplicateFrom: string | null;
  currentThemeId: string;
  onSave: (theme: CustomTheme) => void;
  onDelete?: (themeId: string) => void;
  onClose: () => void;
}

export function ThemeEditorModal({
  existingTheme,
  duplicateFrom,
  currentThemeId,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(existingTheme?.name ?? "My Theme");
  const [vars, setVars] = useState<ThemeVars>(() => {
    if (existingTheme) return { ...existingTheme.vars } as unknown as ThemeVars;
    if (duplicateFrom && builtInThemes[duplicateFrom as keyof typeof builtInThemes]) {
      return { ...builtInThemes[duplicateFrom as keyof typeof builtInThemes] };
    }
    return { ...builtInThemes.blend };
  });
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savedThemeRef = useRef(currentThemeId);

  // Apply live preview on mount and cleanup on unmount
  useEffect(() => {
    applyThemeVars(vars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVarChange = (key: keyof ThemeVars, value: string) => {
    const updated = { ...vars, [key]: value };
    setVars(updated);
    applyThemeVars(updated);
  };

  const handleCancel = () => {
    applyTheme(savedThemeRef.current);
    onClose();
  };

  const handleSave = () => {
    const id = existingTheme?.id ?? `custom-${crypto.randomUUID()}`;
    onSave({
      id,
      /* v8 ignore next */
      name: name.trim() || "Untitled",
      vars: { ...vars } as Record<string, string>,
      baseTheme: existingTheme?.baseTheme ?? duplicateFrom ?? undefined,
      createdAt: existingTheme?.createdAt ?? new Date().toISOString(),
    });
  };

  const handleExport = async () => {
    const exportData = { name, vars };
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: just show the text
    }
  };

  const handleImport = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.vars || typeof parsed.vars !== "object") {
        setImportError("Invalid theme: missing 'vars' object");
        return;
      }
      // Validate all required keys exist
      const requiredKeys = Object.keys(builtInThemes.blend);
      const missing = requiredKeys.filter((k) => !(k in parsed.vars));
      if (missing.length > 0) {
        setImportError(`Missing variables: ${missing.join(", ")}`);
        return;
      }
      const imported = {} as Record<string, string>;
      for (const k of requiredKeys) {
        imported[k] = String(parsed.vars[k]);
      }
      const importedVars = imported as unknown as ThemeVars;
      setVars(importedVars);
      applyThemeVars(importedVars);
      if (parsed.name) setName(String(parsed.name));
      setShowImport(false);
      setImportText("");
    } catch {
      setImportError("Invalid JSON");
    }
  };

  const handleDelete = () => {
    /* v8 ignore start */
    if (!existingTheme) return;
    /* v8 ignore stop */
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.(existingTheme.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        className="flex max-h-[85vh] w-[520px] max-w-[90vw] flex-col rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Theme editor"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Theme name"
            className="flex-1 rounded px-2 py-1 text-sm font-medium"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              outline: "none",
            }}
          />
          <div className="ml-3 flex items-center gap-2">
            <button
              onClick={handleCancel}
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
              disabled={!name.trim()}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
                opacity: !name.trim() ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Color editor */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {THEME_VAR_GROUPS.map((group) => (
            <div key={group.label}>
              <label
                className="mb-2 block text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {group.label}
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {group.vars.map((varName) => (
                  <div key={varName} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={vars[varName as keyof ThemeVars]}
                      onChange={(e) =>
                        handleVarChange(varName as keyof ThemeVars, e.target.value)
                      }
                      className="h-6 w-6 cursor-pointer rounded border-0"
                      style={{
                        backgroundColor: vars[varName as keyof ThemeVars],
                      }}
                    />
                    <span
                      className="flex-1 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {VAR_LABELS[varName] ?? varName}
                    </span>
                    <input
                      type="text"
                      value={vars[varName as keyof ThemeVars]}
                      onChange={(e) =>
                        handleVarChange(varName as keyof ThemeVars, e.target.value)
                      }
                      className="w-[72px] rounded px-1.5 py-0.5 font-mono text-[10px]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Export"}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <Upload className="h-3 w-3" />
            Import
          </button>
          <div className="flex-1" />
          {existingTheme && onDelete && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px]"
              style={{
                backgroundColor: confirmDelete ? "var(--error)" : "var(--bg-surface)",
                color: confirmDelete ? "var(--bg-primary)" : "var(--error)",
                border: `1px solid ${confirmDelete ? "var(--error)" : "var(--border)"}`,
              }}
            >
              <Trash2 className="h-3 w-3" />
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </button>
          )}
        </div>

        {/* Import panel */}
        {showImport && (
          <div
            className="px-4 pb-3 space-y-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='Paste theme JSON here ({"name": "...", "vars": {...}})'
              rows={4}
              className="w-full rounded p-2 font-mono text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                resize: "vertical",
              }}
            />
            {importError && (
              <div className="text-xs" style={{ color: "var(--error)" }}>
                {importError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportText("");
                  setImportError(null);
                }}
                className="rounded px-2 py-1 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="rounded px-2 py-1 text-[10px]"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                  opacity: !importText.trim() ? 0.5 : 1,
                }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
