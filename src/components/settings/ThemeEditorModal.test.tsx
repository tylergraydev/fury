import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeEditorModal } from "./ThemeEditorModal";
import {
  applyTheme as applyThemeMock,
  applyThemeVars as applyThemeVarsMock,
} from "../../lib/themes";
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
      "--overlay": "rgba(0, 0, 0, 0.5)",
      "--overlay-heavy": "rgba(0, 0, 0, 0.8)",
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
      "--overlay": "rgba(0, 0, 0, 0.5)",
      "--overlay-heavy": "rgba(0, 0, 0, 0.8)",
    },
  },
  applyThemeVars: vi.fn(),
  applyTheme: vi.fn(),
  THEME_VAR_GROUPS: [
    { label: "Backgrounds", vars: ["--bg-primary", "--bg-secondary", "--bg-surface", "--bg-hover"] },
    { label: "Text", vars: ["--text-primary", "--text-secondary", "--text-muted"] },
    { label: "Accents", vars: ["--accent", "--accent-hover", "--accent-green", "--accent-purple", "--accent-orange"] },
    { label: "Borders & Status", vars: ["--border", "--composer-border", "--overlay", "--overlay-heavy", "--success", "--warning", "--error"] },
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
    "--overlay": "rgba(0, 0, 0, 0.5)",
    "--overlay-heavy": "rgba(0, 0, 0, 0.8)",
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

  it("applies theme vars on mount", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    expect(applyThemeVarsMock).toHaveBeenCalledTimes(1);
    expect(applyThemeVarsMock).toHaveBeenCalledWith(
      expect.objectContaining({ "--accent": "#3b82f6" }),
    );
  });

  it("updates color and applies live preview when a color input changes", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    // Find the text input for --bg-primary (hex value input)
    const hexInputs = screen.getAllByDisplayValue("#000000");
    fireEvent.change(hexInputs[0], { target: { value: "#ff0000" } });
    // applyThemeVars called on mount + on change
    expect(applyThemeVarsMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.vars["--bg-primary"]).toBe("#ff0000");
  });

  it("handles backdrop click to cancel", () => {
    const onClose = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onClose={onClose} />);
    // The outermost div is the backdrop overlay
    const backdrop = screen.getByRole("dialog").parentElement!;
    // Simulate click on the backdrop itself (target === currentTarget)
    fireEvent.click(backdrop);
    expect(applyThemeMock).toHaveBeenCalledWith("blend");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not cancel when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("exports theme to clipboard and resets copied state after timeout", async () => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    render(<ThemeEditorModal {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Export"));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const clipboardArg = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(clipboardArg);
    expect(parsed.name).toBe("My Theme");
    expect(parsed.vars).toBeDefined();
    // Should show "Copied!" text
    expect(screen.getByText("Copied!")).toBeTruthy();
    // After 2000ms timeout, "Copied!" should revert to "Export"
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Copied!")).toBeNull();
    expect(screen.getByText("Export")).toBeTruthy();
    vi.useRealTimers();
  });

  it("handles clipboard write failure gracefully", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")),
      },
    });
    render(<ThemeEditorModal {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Export"));
    });
    // Should not crash; "Export" text should still be visible (no "Copied!")
    expect(screen.getByText("Export")).toBeTruthy();
  });

  it("successfully imports valid theme JSON", () => {
    const validTheme = {
      name: "Imported Theme",
      vars: {
        "--bg-primary": "#aaaaaa",
        "--bg-secondary": "#bbbbbb",
        "--bg-surface": "#cccccc",
        "--bg-hover": "#dddddd",
        "--text-primary": "#eeeeee",
        "--text-secondary": "#ffffff",
        "--text-muted": "#111111",
        "--border": "#222222",
        "--accent": "#333333",
        "--accent-hover": "#444444",
        "--accent-green": "#555555",
        "--accent-purple": "#666666",
        "--accent-orange": "#777777",
        "--success": "#888888",
        "--warning": "#999999",
        "--error": "#aabbcc",
        "--composer-border": "#ddeeff",
        "--overlay": "rgba(0,0,0,0.5)",
        "--overlay-heavy": "rgba(0,0,0,0.8)",
      },
    };
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: JSON.stringify(validTheme) } });
    fireEvent.click(screen.getByText("Apply"));
    // Import panel should close
    expect(screen.queryByPlaceholderText(/Paste theme JSON/)).toBeNull();
    // Name should be updated
    expect(screen.getByDisplayValue("Imported Theme")).toBeTruthy();
    // applyThemeVars called with imported vars
    expect(applyThemeVarsMock).toHaveBeenCalledWith(
      expect.objectContaining({ "--accent": "#333333" }),
    );
  });

  it("shows error when importing JSON without vars object", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: JSON.stringify({ name: "bad" }) } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText("Invalid theme: missing 'vars' object")).toBeTruthy();
  });

  it("shows error when importing JSON with vars that is not an object", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: JSON.stringify({ vars: "notobject" }) } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText("Invalid theme: missing 'vars' object")).toBeTruthy();
  });

  it("shows error when importing JSON with missing variables", () => {
    const incompleteTheme = {
      vars: {
        "--bg-primary": "#000000",
        // Missing all other vars
      },
    };
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: JSON.stringify(incompleteTheme) } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText(/Missing variables:/)).toBeTruthy();
  });

  it("imports theme without name and keeps current name", () => {
    const themeNoName = {
      vars: {
        "--bg-primary": "#aaaaaa",
        "--bg-secondary": "#bbbbbb",
        "--bg-surface": "#cccccc",
        "--bg-hover": "#dddddd",
        "--text-primary": "#eeeeee",
        "--text-secondary": "#ffffff",
        "--text-muted": "#111111",
        "--border": "#222222",
        "--accent": "#333333",
        "--accent-hover": "#444444",
        "--accent-green": "#555555",
        "--accent-purple": "#666666",
        "--accent-orange": "#777777",
        "--success": "#888888",
        "--warning": "#999999",
        "--error": "#aabbcc",
        "--composer-border": "#ddeeff",
        "--overlay": "rgba(0,0,0,0.5)",
        "--overlay-heavy": "rgba(0,0,0,0.8)",
      },
    };
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    fireEvent.change(textarea, { target: { value: JSON.stringify(themeNoName) } });
    fireEvent.click(screen.getByText("Apply"));
    // Name stays as default "My Theme"
    expect(screen.getByDisplayValue("My Theme")).toBeTruthy();
  });

  it("clears import error when clicking Apply again", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    // First: invalid JSON
    fireEvent.change(textarea, { target: { value: "not json" } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText("Invalid JSON")).toBeTruthy();
    // Second: another attempt clears previous error first
    fireEvent.change(textarea, { target: { value: JSON.stringify({ name: "bad" }) } });
    fireEvent.click(screen.getByText("Apply"));
    // Now shows new error, old one cleared
    expect(screen.queryByText("Invalid JSON")).toBeNull();
    expect(screen.getByText("Invalid theme: missing 'vars' object")).toBeTruthy();
  });

  it("closes import panel via Cancel button inside import panel", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    expect(screen.getByPlaceholderText(/Paste theme JSON/)).toBeTruthy();
    // The import panel has its own Cancel button (separate from the header Cancel)
    const cancelButtons = screen.getAllByText("Cancel");
    // Click the import panel cancel (last one)
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.queryByPlaceholderText(/Paste theme JSON/)).toBeNull();
  });

  it("toggles import panel off when Import button clicked again", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    expect(screen.getByPlaceholderText(/Paste theme JSON/)).toBeTruthy();
    fireEvent.click(screen.getByText("Import"));
    expect(screen.queryByPlaceholderText(/Paste theme JSON/)).toBeNull();
  });

  it("disables Apply button when import text is empty", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const applyBtn = screen.getByText("Apply");
    expect(applyBtn.style.opacity).toBe("0.5");
  });

  it("disables Save when name is whitespace only", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    const nameInput = screen.getByDisplayValue("My Theme");
    fireEvent.change(nameInput, { target: { value: "   " } });
    const saveBtn = screen.getByText("Save");
    expect(saveBtn).toHaveAttribute("disabled");
    expect(saveBtn.style.opacity).toBe("0.5");
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves existing theme baseTheme and createdAt on save", () => {
    const onSave = vi.fn();
    render(
      <ThemeEditorModal
        {...defaultProps}
        existingTheme={existingTheme}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.baseTheme).toBe("blend");
    expect(saved.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("sets baseTheme to undefined when no existingTheme and no duplicateFrom", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.baseTheme).toBeUndefined();
  });

  it("falls back to blend theme when duplicateFrom is not a built-in theme", () => {
    const onSave = vi.fn();
    render(
      <ThemeEditorModal
        {...defaultProps}
        duplicateFrom="nonexistent-theme"
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    // Should use blend defaults since "nonexistent-theme" is not a built-in
    expect(saved.vars["--accent"]).toBe("#3b82f6");
  });

  it("does not delete when existingTheme is null", () => {
    const onDelete = vi.fn();
    // Without existingTheme, Delete button is not rendered at all
    render(<ThemeEditorModal {...defaultProps} onDelete={onDelete} />);
    expect(screen.queryByText("Delete")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not show Delete button when onDelete is not provided", () => {
    render(
      <ThemeEditorModal
        existingTheme={existingTheme}
        duplicateFrom={null}
        currentThemeId="blend"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("updates name input value on change", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    const nameInput = screen.getByDisplayValue("My Theme");
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    expect(screen.getByDisplayValue("New Name")).toBeTruthy();
  });

  it("renders color inputs for all theme variables", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    // Each var has both a color input and a text input, so check for hex values
    const primaryInputs = screen.getAllByDisplayValue("#000000");
    expect(primaryInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("handles color picker type=color input changes", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    // Get the color type inputs
    const colorInputs = document.querySelectorAll('input[type="color"]');
    expect(colorInputs.length).toBeGreaterThan(0);
    fireEvent.change(colorInputs[0], { target: { value: "#abcdef" } });
    // applyThemeVars called on mount + on change
    expect(applyThemeVarsMock).toHaveBeenCalledTimes(2);
  });

  it("handles text hex input changes for color vars", () => {
    const onSave = vi.fn();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    // Get text inputs (type="text") for hex values
    const textInputs = document.querySelectorAll('input[type="text"]');
    expect(textInputs.length).toBeGreaterThan(0);
    fireEvent.change(textInputs[0], { target: { value: "#123456" } });
    // applyThemeVars called on mount + on change
    expect(applyThemeVarsMock).toHaveBeenCalledTimes(2);
    // Verify the change persists in saved data
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.vars["--bg-primary"]).toBe("#123456");
  });

  it("creates new createdAt timestamp for new themes on save", () => {
    const onSave = vi.fn();
    const before = new Date().toISOString();
    render(<ThemeEditorModal {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    const saved = onSave.mock.calls[0][0] as CustomTheme;
    expect(saved.createdAt).toBeDefined();
    expect(saved.createdAt >= before).toBe(true);
  });

  it("clears import text and error when import panel cancel is clicked", () => {
    render(<ThemeEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Import"));
    const textarea = screen.getByPlaceholderText(/Paste theme JSON/);
    // Type something and trigger error
    fireEvent.change(textarea, { target: { value: "bad json" } });
    fireEvent.click(screen.getByText("Apply"));
    expect(screen.getByText("Invalid JSON")).toBeTruthy();
    // Now cancel
    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    // Import panel should be gone
    expect(screen.queryByPlaceholderText(/Paste theme JSON/)).toBeNull();
    // Re-open import panel - error and text should be cleared
    fireEvent.click(screen.getByText("Import"));
    expect(screen.queryByText("Invalid JSON")).toBeNull();
    expect(screen.getByPlaceholderText(/Paste theme JSON/)).toHaveValue("");
  });
});
