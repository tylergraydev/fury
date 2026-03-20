import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers";
import { fullSettings } from "./test-helpers";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";

describe("ExperimentalTab", () => {
  const goToExperimentalTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Experimental"));
  };

  it("shows Loading when settings not loaded", () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Experimental"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows Spotlight Testing and Agent Teams toggles", () => {
    goToExperimentalTab();
    expect(screen.getByText("Spotlight Testing")).toBeInTheDocument();
    expect(screen.getByText("Agent Teams")).toBeInTheDocument();
  });

  it("toggles Spotlight Testing", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({
          spotlightTesting: true,
        }),
      }),
    );
  });

  it("toggles Agent Teams", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkboxes[1]);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({
          agentTeams: true,
        }),
      }),
    );
  });

  it("shows experimental warning text", () => {
    goToExperimentalTab();
    expect(screen.getByText(/experimental and may change/)).toBeInTheDocument();
  });

  it("shows descriptions for experimental features", () => {
    goToExperimentalTab();
    expect(screen.getByText(/Watch workspace worktree/)).toBeInTheDocument();
    expect(screen.getByText(/Make agents aware of sibling workspaces/)).toBeInTheDocument();
  });

  it("handles saveSettings finally block (sets saving false)", async () => {
    let resolverFn: () => void;
    const saveSettings = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolverFn = resolve; }),
    );
    useSettingsStore.setState({
      appSettings: fullSettings,
      saveSettings,
    });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    await waitFor(() => {
      expect(checkboxes[0]).toBeDisabled();
    });
    await act(async () => {
      resolverFn!();
    });
    await waitFor(() => {
      expect(checkboxes[0]).not.toBeDisabled();
    });
  });

  it("toggles Performance Mode", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkboxes[2]);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({ persistentProcesses: true }),
      }),
    );
  });

  it("toggles Safe Mode", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkboxes[3]);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({ safeMode: true }),
      }),
    );
  });

  it("disables Performance Mode for Codex CLI", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, agentType: "codex_cli" as const },
    });
    goToExperimentalTab();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[2]).toBeDisabled();
    expect(screen.getByText("(Not available with Codex CLI)")).toBeInTheDocument();
  });
});
