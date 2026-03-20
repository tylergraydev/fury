import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "./test-helpers.test";
import { fullSettings } from "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

describe("AppearanceTab", () => {
  it("calls loadSettings if appSettings is null", async () => {
    const loadSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: null,
      loadSettings,
    });
    render(<AppSettingsPanel />);
    expect(loadSettings).toHaveBeenCalled();
  });

  it("does not call loadSettings if appSettings is already set", () => {
    const loadSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: fullSettings,
      loadSettings,
    });
    render(<AppSettingsPanel />);
    expect(loadSettings).not.toHaveBeenCalled();
  });

  it("clicking a theme calls setTheme and saveSettings", async () => {
    const setTheme = vi.fn();
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useUIStore.setState({ theme: "blend", setTheme });
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Midnight"));
    expect(setTheme).toHaveBeenCalledWith("midnight");
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "midnight" }),
    );
  });

  it("shows Active indicator on current theme", () => {
    useUIStore.setState({ theme: "blend" });
    render(<AppSettingsPanel />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("does not show Active indicator on non-selected themes", () => {
    useUIStore.setState({ theme: "blend" });
    render(<AppSettingsPanel />);
    const activeLabels = screen.getAllByText("Active");
    expect(activeLabels).toHaveLength(1);
  });

  it("handles theme click when appSettings is null", () => {
    const setTheme = vi.fn();
    useUIStore.setState({ theme: "blend", setTheme });
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn(),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Midnight"));
    expect(setTheme).toHaveBeenCalledWith("midnight");
  });

  it("handles saveSettings rejection gracefully", async () => {
    const setTheme = vi.fn();
    const saveSettings = vi
      .fn()
      .mockRejectedValue(new Error("save failed"));
    useUIStore.setState({ theme: "blend", setTheme });
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Midnight"));
    expect(setTheme).toHaveBeenCalledWith("midnight");
  });

  it("displays theme descriptions and swatches", () => {
    render(<AppSettingsPanel />);
    expect(
      screen.getByText("Black base with blue accents"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pure black with white accents"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GitHub's dark default palette"),
    ).toBeInTheDocument();
  });

  it("opens theme editor with duplicate from built-in theme", async () => {
    render(<AppSettingsPanel />);
    const duplicateButtons = screen.getAllByTitle("Duplicate as custom theme");
    expect(duplicateButtons.length).toBeGreaterThan(0);
    fireEvent.click(duplicateButtons[0]);
    expect(screen.getByTestId("theme-editor-modal")).toBeInTheDocument();
    expect(screen.getByTestId("duplicate-from")).toHaveTextContent(/blend|midnight|github-dark/);
    expect(screen.getByTestId("editing-theme")).toHaveTextContent("null");
  });

  it("opens theme editor for creating new custom theme", () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Create Custom Theme"));
    expect(screen.getByTestId("theme-editor-modal")).toBeInTheDocument();
    expect(screen.getByTestId("duplicate-from")).toHaveTextContent("null");
    expect(screen.getByTestId("editing-theme")).toHaveTextContent("null");
  });

  it("closes theme editor when CloseEditor is clicked", () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Create Custom Theme"));
    expect(screen.getByTestId("theme-editor-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("CloseEditor"));
    expect(screen.queryByTestId("theme-editor-modal")).not.toBeInTheDocument();
  });

  it("renders custom themes with swatches and actions", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: {
              "--bg-primary": "#000",
              "--bg-surface": "#111",
              "--accent": "#0ff",
              "--text-primary": "#fff",
            },
          },
        ],
      },
    });
    render(<AppSettingsPanel />);
    expect(screen.getByText("My Dark Theme")).toBeInTheDocument();
    expect(screen.getByText("Custom theme")).toBeInTheDocument();
    expect(screen.getByTitle("Edit theme")).toBeInTheDocument();
    expect(screen.getByTitle("Delete theme")).toBeInTheDocument();
  });

  it("shows Active indicator on custom theme when selected", () => {
    useUIStore.setState({ theme: "custom-1" });
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: {
              "--bg-primary": "#000",
              "--bg-surface": "#111",
              "--accent": "#0ff",
              "--text-primary": "#fff",
            },
          },
        ],
      },
    });
    render(<AppSettingsPanel />);
    const activeLabels = screen.getAllByText("Active");
    expect(activeLabels.length).toBe(1);
  });

  it("clicking custom theme calls setTheme and saveSettings", async () => {
    const setTheme = vi.fn();
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useUIStore.setState({ theme: "blend", setTheme });
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: { "--bg-primary": "#000", "--bg-surface": "#111", "--accent": "#0ff", "--text-primary": "#fff" },
          },
        ],
      },
      saveSettings,
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("My Dark Theme"));
    expect(setTheme).toHaveBeenCalledWith("custom-1");
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "custom-1" }),
    );
  });

  it("opens editor for editing existing custom theme", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: { "--bg-primary": "#000", "--bg-surface": "#111", "--accent": "#0ff", "--text-primary": "#fff" },
          },
        ],
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByTitle("Edit theme"));
    expect(screen.getByTestId("theme-editor-modal")).toBeInTheDocument();
    expect(screen.getByTestId("editing-theme")).toHaveTextContent("custom-1");
    expect(screen.getByTestId("duplicate-from")).toHaveTextContent("null");
  });

  it("deletes custom theme when delete button is clicked", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: { "--bg-primary": "#000", "--bg-surface": "#111", "--accent": "#0ff", "--text-primary": "#fff" },
          },
        ],
      },
      saveSettings,
    });
    render(<AppSettingsPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Delete theme"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ customThemes: [] }),
    );
  });

  it("deletes active custom theme and resets to blend", async () => {
    const setTheme = vi.fn();
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useUIStore.setState({ theme: "custom-1", setTheme });
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        theme: "custom-1",
        customThemes: [
          {
            id: "custom-1",
            name: "My Dark Theme",
            createdAt: "2024-01-01T00:00:00Z",
            vars: { "--bg-primary": "#000", "--bg-surface": "#111", "--accent": "#0ff", "--text-primary": "#fff" },
          },
        ],
      },
      saveSettings,
    });
    render(<AppSettingsPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Delete theme"));
    });
    expect(setTheme).toHaveBeenCalledWith("blend");
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "blend", customThemes: [] }),
    );
  });

  it("saves custom theme from editor modal", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const setTheme = vi.fn();
    useUIStore.setState({ theme: "blend", setTheme });
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Create Custom Theme"));
    await act(async () => {
      fireEvent.click(screen.getByText("SaveTheme"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        customThemes: expect.arrayContaining([
          expect.objectContaining({ id: "custom-new" }),
        ]),
      }),
    );
    expect(setTheme).toHaveBeenCalledWith("custom-new");
  });

  it("updates an existing custom theme via save", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const setTheme = vi.fn();
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          { id: "existing-ct", name: "Old Name", createdAt: "2024-01-01T00:00:00Z", vars: { "--bg-primary": "#000" } },
        ],
      },
      saveSettings,
    });
    useUIStore.setState({ theme: "existing-ct", setTheme } as any);
    render(<AppSettingsPanel />);

    const editButton = screen.getByTitle("Edit theme");
    fireEvent.click(editButton);
    expect(screen.getByTestId("theme-editor-modal")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("SaveExisting"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        customThemes: [
          expect.objectContaining({ id: "existing-ct", name: "Updated" }),
        ],
      }),
    );
  });

  it("renders custom theme with missing vars (filter falsy swatches)", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        customThemes: [
          {
            id: "sparse-theme",
            name: "Sparse",
            createdAt: "2024-01-01T00:00:00Z",
            vars: { "--bg-primary": "#000" },
          },
        ],
      },
    });
    render(<AppSettingsPanel />);
    expect(screen.getByText("Sparse")).toBeInTheDocument();
  });
});
