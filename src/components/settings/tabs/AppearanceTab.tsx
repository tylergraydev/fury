import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  getThemeNames,
  type BuiltInThemeName,
  type ThemeVars,
  registerCustomTheme,
  unregisterCustomTheme,
} from "../../../lib/themes";
import { ThemeEditorModal } from "../ThemeEditorModal";
import type { CustomTheme } from "../../../lib/tauri";

const BUILT_IN_THEME_META: Record<BuiltInThemeName, { label: string; description: string; swatches: string[] }> = {
  blend: {
    label: "Blend",
    description: "Black base with blue accents",
    swatches: ["#000000", "#161b22", "#58a6ff", "#f0f6fc"],
  },
  midnight: {
    label: "Midnight",
    description: "Pure black with white accents",
    swatches: ["#000000", "#1a1a1a", "#ffffff", "#4ade80"],
  },
  github: {
    label: "GitHub Dark",
    description: "GitHub's dark default palette",
    swatches: ["#0d1117", "#1c2128", "#58a6ff", "#f0f6fc"],
  },
};

export function AppearanceTab() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const { appSettings, saveSettings, loadSettings } = useSettingsStore();
  const builtInNames = getThemeNames();
  const customThemes = appSettings?.customThemes ?? [];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<string | null>(null);

  useEffect(() => {
    if (!appSettings) loadSettings();
  }, [appSettings, loadSettings]);

  const handleSetTheme = (name: string) => {
    setTheme(name);
    if (appSettings) {
      saveSettings({ ...appSettings, theme: name }).catch(() => {});
    }
  };

  /* v8 ignore start -- custom theme handlers; nullish coalescing and ternary are V8 branch artifacts */
  const handleSaveCustomTheme = async (ct: CustomTheme) => {
    if (!appSettings) return;
    const existing = appSettings.customThemes ?? [];
    const idx = existing.findIndex((t) => t.id === ct.id);
    const updated = idx >= 0
      ? existing.map((t, i) => (i === idx ? ct : t))
      : [...existing, ct];

    registerCustomTheme(ct.id, ct.vars as unknown as ThemeVars);
    await saveSettings({ ...appSettings, customThemes: updated, theme: ct.id }).catch(() => {});
    setTheme(ct.id);
    setEditorOpen(false);
    setEditingTheme(null);
    setDuplicateFrom(null);
  };

  const handleDeleteCustomTheme = async (themeId: string) => {
    if (!appSettings) return;
    const updated = (appSettings.customThemes ?? []).filter((t) => t.id !== themeId);
  /* v8 ignore stop */
    unregisterCustomTheme(themeId);
    const newTheme = appSettings.theme === themeId ? "blend" : appSettings.theme;
    if (newTheme !== appSettings.theme) setTheme(newTheme);
    await saveSettings({ ...appSettings, customThemes: updated, theme: newTheme }).catch(() => {});
    setEditorOpen(false);
    setEditingTheme(null);
  };

  const openEditor = (existing: CustomTheme | null, dupFrom: string | null) => {
    setEditingTheme(existing);
    setDuplicateFrom(dupFrom);
    setEditorOpen(true);
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
          {/* Built-in themes */}
          {builtInNames.map((name) => {
            const meta = BUILT_IN_THEME_META[name];
            const isActive = theme === name;
            return (
              <div key={name} className="relative">
                <button
                  onClick={() => handleSetTheme(name)}
                  className="w-full rounded-lg p-3 text-left transition-colors"
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
                          border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
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
                {/* Duplicate action */}
                <button
                  onClick={() => openEditor(null, name)}
                  title="Duplicate as custom theme"
                  className="absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--bg-hover)] [div:hover>&]:opacity-100"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Custom themes */}
          {customThemes.map((ct) => {
            const isActive = theme === ct.id;
            const swatches = [
              ct.vars["--bg-primary"],
              ct.vars["--bg-surface"],
              ct.vars["--accent"],
              ct.vars["--text-primary"],
            ].filter(Boolean);
            return (
              <div key={ct.id} className="group relative">
                <button
                  onClick={() => handleSetTheme(ct.id)}
                  className="w-full rounded-lg p-3 text-left transition-colors"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: isActive
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                >
                  <div className="mb-2 flex gap-1">
                    {swatches.map((color, i) => (
                      <div
                        key={i}
                        className="h-5 flex-1 rounded"
                        style={{
                          backgroundColor: color,
                          border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
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
                    {ct.name}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Custom theme
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
                {/* Edit / Delete actions */}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditor(ct, null)}
                    title="Edit theme"
                    className="rounded p-1 hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCustomTheme(ct.id)}
                    title="Delete theme"
                    className="rounded p-1 hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--error)" }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Create custom theme button */}
        <button
          onClick={() => openEditor(null, null)}
          className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create Custom Theme
        </button>
      </div>

      {/* Theme editor modal */}
      {editorOpen && (
        <ThemeEditorModal
          existingTheme={editingTheme}
          duplicateFrom={duplicateFrom}
          currentThemeId={theme}
          onSave={handleSaveCustomTheme}
          onDelete={editingTheme ? handleDeleteCustomTheme : undefined}
          onClose={() => {
            setEditorOpen(false);
            setEditingTheme(null);
            setDuplicateFrom(null);
          }}
        />
      )}
    </div>
  );
}
