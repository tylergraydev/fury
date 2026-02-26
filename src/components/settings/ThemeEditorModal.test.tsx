import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeEditorModal } from "./ThemeEditorModal";
import { applyTheme as applyThemeMock } from "../../lib/themes";
import type { CustomTheme } from "../../lib/tauri";

vi.mock("lucide-react", () => ({
  Copy: () => <span data-testid="copy-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
}));

vi.mock("../../lib/themes", () => ({
  builtInThemes: {
    blend: {
      "--bg-primary": "#000000",
      "--bg-secondary": "#0d1117",
      "--bg-surface": "#161b22",
      "--bg-hover": "#1c2128",
      "--text-primary": "#f0f6fc",
      "--text-secondary": "#b0b0b0",
      "--text-muted": "#6e7681",
      "--border": "#30363d",
      "--accent": "#3b82f6",
      "--accent-hover": "#2563eb",
      "--accent-green": "#22c55e",
      "--accent-purple": "#a855f7",
      "--accent-orange": "#f97316",
      "--success": "#4ade80",
      "--warning": "#facc15",
      "--error": "#f87171",
      "--composer-border": "#8B6E5A",
    },
    midnight: {
      "--bg-primary": "#000000",
      "--bg-secondary": "#0a0a0a",
      "--bg-surface": "#1a1a1a",
      "--bg-hover": "#252525",
      "--text-primary": "#ffffff",
      "--text-secondary": "#b0b0b0",
      "--text-muted": "#666666",
      "--border": "#262626",
      "--accent": "#ffffff",
      "--accent-hover": "#d4d4d4",
      "--accent-green": "#4ade80",
      "--accent-purple": "#a855f7",
      "--accent-orange": "#f97316",
      "--success": "#4ade80",
      "--warning": "#facc15",
      "--error": "#f87171",
      "--composer-border": "#8B6E5A",
    },
  },
  applyThemeVars: vi.fn(),
  applyTheme: vi.fn(),
  THEME_VAR_GROUPS: [
    { label: "Backgrounds", vars: ["--bg-primary", "--bg-secondary", "--bg-surface", "--bg-hover"] },
    { label: "Text", vars: ["--text-primary", "--text-secondary", "--text-muted"] },
    { label: "Accents", vars: ["--accent", "--accent-hover", "--accent-green", "--accent-purple", "--accent-orange"] },
    { label: "Borders & Status", vars: ["--border", "--composer-border", "--success", "--warning", "--error"] },
  ],
}));

const existingTheme: CustomTheme = {
  id: "custom-existing",
  name: "My Custom Theme",
  vars: {
    "--bg-primary": "#111111",
    "--bg-secondary": "#222222",
    "--bg-surface": "#333333",
    "--bg-hover": "#444444",
    "--text-primary": "#eeeeee",
    "--text-secondary": "#cccccc",
    "--text-muted": "#999999",
    "--border": "#555555",
    "--accent": "#ff0000",
    "--accent-hover": "#cc0000",
    "--accent-green": "#00ff00",
    "--accent-purple": "#9900ff",
    "--accent-orange": "#ff9900",
    "--success": "#00ff00",
    "--warning": "#ffff00",
    "--error": "#ff0000",
    "--composer-border": "#666666",
  },
  baseTheme: "blend",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("ThemeEditorModal", () => {
  const defaultProps = {
    existingTheme: null,
    duplicateFrom: null,
    currentThemeId: "blend",
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default name for new theme", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    const nameInput = screen.getByDisplayValue("My Theme");
    expect(nameInput).toBeTruthy();
  });

  it("renders with existing theme name when editing", () => {
    render(<ThemeEditorModal {...defaultProps} existingTheme={existingTheme} />);
    expect(screen.getByDisplayValue("My Custom Theme")).toBeTruthy();
  });

  it("shows all 4 color groups", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    expect(screen.getByText("Backgrounds")).toBeTruthy();
    expect(screen.getByText("Text")).toBeTruthy();
    expect(screen.getByText("Accents")).toBeTruthy();
    expect(screen.getByText("Borders & Status")).toBeTruthy();
  });

  it("shows Save and Cancel buttons", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("shows Export and Import buttons", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    expect(screen.getByText("Export")).toBeTruthy();
    expect(screen.getByText("Import")).toBeTruthy();
  });

  it("calls onSave with correct data when Save is clicked", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.name).toBe("My Theme");
    expect(saved.id).toMatch(/^custom-/);
    expect(saved.vars["--accent"]).toBe("#3b82f6"); // blend default
  });

  it("preserves existing theme ID when editing", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} existingTheme={existingTheme} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.id).toBe("custom-existing");
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(applyThemeMock).toHaveBeenCalledWith("blend");
  });

  it("shows Delete button only for existing themes", () => {
    const { rerender } = render(<ThemeEditorModal {...defaultProps} />);
    expect(screen.queryByText("Delete")).toBeNull();

    rerender(
      <ThemeEditorModal
        {...defaultProps}
        existingTheme={existingTheme}
      />,
    );
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("requires confirmation before deleting", () => {
    const onDelete = vi.fn();
    render(
      <ThemeEditorModal
        {...defaultProps}
        existingTheme={existingTheme}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm Delete")).toBeTruthy();
    fireEvent.click(screen.getByText("Confirm Delete"));
    expect(onDelete).toHaveBeenCalledWith("custom-existing");
  });

  it("uses duplicateFrom theme colors when provided", () => {
    const onSave = vi.fn();
    render(
      <ThemeEditorModal
        {...defaultProps}
        duplicateFrom="midnight"
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.vars["--accent"]).toBe("#ffffff"); // midnight accent
    expect(saved.baseTheme).toBe("midnight");
  });

  it("shows import panel when Import is clicked", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    expect(screen.getByPlaceholderText(/Paste theme JSON/)).toBeTruthy();
  });

  it("shows error for invalid import JSON", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: "not json" } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText("Invalid JSON")).toBeTruthy();
  });

  it("disables Save when name is empty", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    const nameInput = screen.getByDisplayValue("My Theme");
    fireEvent.change(nameInput, { target: { value: "" } });
    const saveBtn = screen.getByText("Save");
    expect(saveBtn.style.opacity).toBe("0.5");
  });
});
