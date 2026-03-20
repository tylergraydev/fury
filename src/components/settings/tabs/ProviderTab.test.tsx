import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers";
import { fullSettings } from "./test-helpers";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

describe("ProviderTab", () => {
  const goToProviderTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
  };

  it("shows Loading when settings not yet loaded", async () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders provider selector with all provider options", async () => {
    goToProviderTab();
    const select = await screen.findByDisplayValue("Anthropic");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("Vercel AI Gateway")).toBeInTheDocument();
    expect(screen.getByText("AWS Bedrock")).toBeInTheDocument();
    expect(screen.getByText("Google Vertex")).toBeInTheDocument();
    expect(screen.getByText("Azure Foundry")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("changes provider type when selector changes", async () => {
    goToProviderTab();
    const select = await screen.findByDisplayValue("Anthropic");
    fireEvent.change(select, { target: { value: "OpenRouter" } });
    await waitFor(() => {
      expect(screen.getByDisplayValue("OpenRouter")).toBeInTheDocument();
    });
  });

  it("shows ANTHROPIC_API_KEY hint input for Anthropic provider", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
  });

  it("shows Bedrock env var hints when Bedrock is selected", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        provider: { providerType: "Bedrock", envVars: {} },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("AWS_ACCESS_KEY_ID")).toBeInTheDocument();
      expect(screen.getByText("AWS_SECRET_ACCESS_KEY")).toBeInTheDocument();
      expect(screen.getByText("AWS_REGION")).toBeInTheDocument();
    });
  });

  it("does not show hint inputs for Custom provider", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        provider: { providerType: "Custom", envVars: {} },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("Additional Environment Variables")).toBeInTheDocument();
    });
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  it("toggles env var visibility with Show/Hide button", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByText("Show"));
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByText("Hide"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("updates env var value when typing", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY"),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY");
    fireEvent.change(input, { target: { value: "sk-test-123" } });
    expect(input).toHaveValue("sk-test-123");
  });

  it("shows extra env vars that are not in hints", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        provider: {
          providerType: "Anthropic",
          envVars: {
            ANTHROPIC_API_KEY: "sk-test",
            CUSTOM_VAR: "custom-value",
          },
        },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("CUSTOM_VAR")).toBeInTheDocument();
      expect(screen.getByText("custom-value")).toBeInTheDocument();
    });
  });

  it("removes extra env var when X button is clicked", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        provider: {
          providerType: "Anthropic",
          envVars: {
            ANTHROPIC_API_KEY: "sk-test",
            CUSTOM_VAR: "custom-value",
          },
        },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("CUSTOM_VAR")).toBeInTheDocument();
    });
    const customVarRow = screen.getByText("CUSTOM_VAR").closest("div");
    const removeBtn = customVarRow!.querySelector("button");
    fireEvent.click(removeBtn!);
    await waitFor(() => {
      expect(screen.queryByText("CUSTOM_VAR")).not.toBeInTheDocument();
    });
  });

  it("adds a new env var using AddEnvVarRow", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("KEY")).toBeInTheDocument();
    });
    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "MY_VAR" } });
    fireEvent.change(valueInput, { target: { value: "my_value" } });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getByText("MY_VAR")).toBeInTheDocument();
    });
  });

  it("does not add env var when key is empty", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("KEY")).toBeInTheDocument();
    });
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(valueInput, { target: { value: "my_value" } });
    fireEvent.click(screen.getByText("Add"));
    expect(screen.queryByText("my_value")).not.toBeInTheDocument();
  });

  it("adds env var via Enter key on value input", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("KEY")).toBeInTheDocument();
    });
    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "ENTER_VAR" } });
    fireEvent.change(valueInput, { target: { value: "enter_value" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("ENTER_VAR")).toBeInTheDocument();
    });
  });

  it("does not add env var on non-Enter key press", async () => {
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("KEY")).toBeInTheDocument();
    });
    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "NOPE_VAR" } });
    fireEvent.change(valueInput, { target: { value: "nope_value" } });
    fireEvent.keyDown(valueInput, { key: "a" });
    expect(screen.queryByText("NOPE_VAR")).not.toBeInTheDocument();
  });

  it("saves settings and closes when Save is clicked", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const closeViewTab = vi.fn();
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useUIStore.setState({ closeViewTab });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
      expect(closeViewTab).toHaveBeenCalledWith("settings");
    });
  });

  it("shows Saving... while save is in progress", async () => {
    let resolverFn: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolverFn = resolve;
    });
    const saveSettings = vi.fn().mockReturnValue(savePromise);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
  });

  it("shows error when save fails", async () => {
    const saveSettings = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByText("Error: Network error")).toBeInTheDocument();
    });
  });

  it("Cancel button closes settings", async () => {
    const closeViewTab = vi.fn();
    useUIStore.setState({ closeViewTab });
    goToProviderTab();
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(closeViewTab).toHaveBeenCalledWith("settings");
  });

  it("changes provider type via select onChange", async () => {
    goToProviderTab();
    const select = await screen.findByDisplayValue("Anthropic");
    fireEvent.change(select, { target: { value: "Vertex" } });
    await waitFor(() => {
      expect(screen.getByText("GOOGLE_APPLICATION_CREDENTIALS")).toBeInTheDocument();
      expect(screen.getByText("GOOGLE_PROJECT_ID")).toBeInTheDocument();
    });
  });

  it("changes agent type when Agent select changes", async () => {
    goToProviderTab();
    const agentSelect = await screen.findByDisplayValue("Claude Code");
    fireEvent.change(agentSelect, { target: { value: "codex_cli" } });
    await waitFor(() => {
      expect(screen.getByDisplayValue("Codex CLI")).toBeInTheDocument();
    });
  });

  it("changes OPENAI_API_KEY value when typing", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        agentType: "codex_cli" as const,
        provider: { providerType: "Anthropic" as const, envVars: {} },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter OPENAI_API_KEY")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Enter OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-test-key" } });
    expect(input).toHaveValue("sk-test-key");
  });

  it("toggles OPENAI_API_KEY visibility for Codex CLI agent", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        agentType: "codex_cli" as const,
        provider: { providerType: "Anthropic" as const, envVars: {} },
      },
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    await waitFor(() => {
      expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("Enter OPENAI_API_KEY");
    expect(input).toHaveAttribute("type", "password");
    const showButtons = screen.getAllByText("Show");
    fireEvent.click(showButtons[0]);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });
});
