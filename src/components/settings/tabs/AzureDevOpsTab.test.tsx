import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers.test";
import { fullSettings } from "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

describe("AzureDevOpsTab", () => {
  function goToAzureDevOpsTab() {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Azure DevOps"));
  }

  it("shows Loading... when appSettings is null", () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Azure DevOps"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows PAT and Organization inputs", async () => {
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByText("Personal Access Token (PAT)")).toBeInTheDocument();
      expect(screen.getByText("Default Organization")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("my-org")).toBeInTheDocument();
    });
  });

  it("toggles PAT visibility with Show/Hide button", async () => {
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("PAT token...");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByText("Show"));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByText("Hide"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("types in PAT and org fields", async () => {
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    const patInput = screen.getByPlaceholderText("PAT token...");
    const orgInput = screen.getByPlaceholderText("my-org");
    fireEvent.change(patInput, { target: { value: "test-pat" } });
    fireEvent.change(orgInput, { target: { value: "my-company" } });
    expect(patInput).toHaveValue("test-pat");
    expect(orgInput).toHaveValue("my-company");
  });

  it("saves settings with PAT and org", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const closeViewTab = vi.fn();
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useUIStore.setState({ closeViewTab });
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("PAT token..."), {
      target: { value: "my-pat-token" },
    });
    fireEvent.change(screen.getByPlaceholderText("my-org"), {
      target: { value: "my-company" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevops: { pat: "my-pat-token", defaultOrg: "my-company" },
      }),
    );
    expect(closeViewTab).toHaveBeenCalledWith("settings");
  });

  it("saves null for empty PAT and org", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevops: { pat: null, defaultOrg: null },
      }),
    );
  });

  it("shows error when save fails", async () => {
    const saveSettings = vi.fn().mockRejectedValue(new Error("Save error"));
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Save error/)).toBeInTheDocument();
    });
  });

  it("shows Saving... while save is in progress", async () => {
    let resolverFn: () => void;
    const saveSettings = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolverFn = resolve; }),
    );
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
  });

  it("Cancel closes settings", async () => {
    const closeViewTab = vi.fn();
    useUIStore.setState({ closeViewTab } as any);
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(closeViewTab).toHaveBeenCalledWith("settings");
  });

  it("populates PAT and org from saved settings", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        azureDevops: { pat: "saved-pat", defaultOrg: "saved-org" },
      },
    });
    goToAzureDevOpsTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("PAT token...")).toHaveValue("saved-pat");
      expect(screen.getByPlaceholderText("my-org")).toHaveValue("saved-org");
    });
  });

  it("does not save when appSettings is null", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: null, saveSettings, loadSettings: vi.fn() });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Azure DevOps"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
