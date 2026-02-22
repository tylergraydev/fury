import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({ ensureTypesLoaded: vi.fn() }));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
}));

const mockDetectCursorrules = vi.fn().mockResolvedValue(false);
const mockImportCursorrules = vi.fn().mockResolvedValue({
  rulesFound: true,
  claudeMdExisted: false,
  written: true,
  claudeMdPath: "/repo/CLAUDE.md",
});

vi.mock("../../lib/tauri", () => ({
  loadSettings: vi.fn().mockResolvedValue({
    theme: "blend",
    provider: { providerType: "Anthropic", envVars: {} },
    systemPromptAdditions: null,
    analyticsEnabled: false,
    experimental: { spotlightTesting: false, agentTeams: false },
    copilot: { enabled: false },
  }),
  getAppSettings: vi.fn().mockResolvedValue({
    theme: "blend",
    provider: { providerType: "Anthropic", envVars: {} },
    systemPromptAdditions: null,
    analyticsEnabled: false,
    experimental: { spotlightTesting: false, agentTeams: false },
    copilot: { enabled: false },
  }),
  updateAppSettings: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  detectCursorrules: (...args: unknown[]) => mockDetectCursorrules(...args),
  importCursorrules: (...args: unknown[]) => mockImportCursorrules(...args),
  migrateCursorConfig: vi.fn().mockResolvedValue({ success: true }),
  listen: vi.fn().mockResolvedValue(() => {}),
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listMcpServers: vi.fn().mockResolvedValue([]),
  checkCursorConfig: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../lib/keybindings", () => ({
  isMac: false,
}));

// Mock the dynamic import for @tauri-apps/plugin-updater
const mockUpdaterCheck = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockUpdaterCheck(...args),
}));

// Mock the dynamic import for @tauri-apps/plugin-shell
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

import { AppSettingsPanel } from "./AppSettingsPanel";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { useCopilotStore } from "../../stores/copilotStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  Key: () => <span data-testid="key-icon" />,
  Server: () => <span data-testid="server-icon" />,
  ArrowLeftRight: () => <span data-testid="arrow-icon" />,
  FlaskConical: () => <span data-testid="flask-icon" />,
  Download: () => <span data-testid="download-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Palette: () => <span data-testid="palette-icon" />,
  Sparkles: () => <span data-testid="sparkle-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  CheckCircle2: () => <span data-testid="check-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  ExternalLink: () => <span data-testid="link-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
}));

const fullSettings = {
  theme: "blend" as const,
  provider: {
    providerType: "Anthropic" as const,
    envVars: {} as Record<string, string>,
  },
  systemPromptAdditions: null,
  analyticsEnabled: false,
  experimental: { spotlightTesting: false, agentTeams: false },
  copilot: { enabled: false },
};

beforeEach(() => {
  useSettingsStore.setState({
    appSettings: fullSettings,
    mcpServers: [],
    cursorDetected: null,
    loading: false,
    error: null,
  });
  useUIStore.setState({
    theme: "blend",
  });
  useCopilotStore.setState({
    connectionStatus: "disconnected",
    authStatus: null,
    signInResult: null,
    error: null,
  });
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
  });
  useRepositoryStore.setState({
    repositories: [],
  });
  vi.clearAllMocks();
  // Reset mock implementations after clearAllMocks
  mockDetectCursorrules.mockResolvedValue(false);
  mockImportCursorrules.mockResolvedValue({
    rulesFound: true,
    claudeMdExisted: false,
    written: true,
    claudeMdPath: "/repo/CLAUDE.md",
  });
  mockUpdaterCheck.mockResolvedValue(null);
});

describe("AppSettingsPanel", () => {
  it("renders settings navigation tabs", () => {
    render(<AppSettingsPanel />);
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
  });

  it("shows Appearance tab by default", () => {
    render(<AppSettingsPanel />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("switches between tabs", async () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Provider"));
    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
  });

  it("shows theme options in Appearance tab", () => {
    render(<AppSettingsPanel />);
    expect(screen.getByText("Blend")).toBeInTheDocument();
    expect(screen.getByText("Midnight")).toBeInTheDocument();
    expect(screen.getByText("GitHub Dark")).toBeInTheDocument();
  });

  it("shows additional navigation items", () => {
    render(<AppSettingsPanel />);
    expect(screen.getByText("Copilot")).toBeInTheDocument();
    expect(screen.getByText("Migration")).toBeInTheDocument();
    expect(screen.getByText("Experimental")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
  });

  it("shows Settings header", () => {
    render(<AppSettingsPanel />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("close button calls closeViewTab", () => {
    const closeViewTab = vi.fn();
    useUIStore.setState({ closeViewTab: closeViewTab });
    render(<AppSettingsPanel />);
    // The close button is the one near the "Settings" header with the X icon
    const closeButtons = screen.getAllByRole("button");
    // First button in the sidebar that contains the x-icon
    const closeBtn = closeButtons.find(
      (btn) => btn.querySelector('[data-testid="x-icon"]') !== null,
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(closeViewTab).toHaveBeenCalledWith("settings");
  });

  it("switches to all tabs correctly", async () => {
    render(<AppSettingsPanel />);

    // Copilot tab
    fireEvent.click(screen.getByText("Copilot"));
    expect(screen.getByText("Enable GitHub Copilot")).toBeInTheDocument();

    // MCP Servers tab
    fireEvent.click(screen.getByText("MCP Servers"));
    expect(screen.getByText("Add MCP Server")).toBeInTheDocument();

    // Migration tab
    fireEvent.click(screen.getByText("Migration"));
    expect(
      screen.getByText("Import MCP Servers from Cursor"),
    ).toBeInTheDocument();

    // Experimental tab
    fireEvent.click(screen.getByText("Experimental"));
    expect(screen.getByText("Spotlight Testing")).toBeInTheDocument();

    // Updates tab
    fireEvent.click(screen.getByText("Updates"));
    expect(screen.getByText("Check for Updates")).toBeInTheDocument();
  });

  it("uses non-mac paddingTop when isMac is false", () => {
    render(<AppSettingsPanel />);
    // The header container has paddingTop based on isMac
    // We mocked isMac = false so paddingTop should be 12
    const settingsHeader = screen.getByText("Settings").closest("div");
    expect(settingsHeader).toHaveStyle({ paddingTop: "12px" });
  });
});

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
    // Only one "Active" label should exist
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
    // When appSettings is null, clicking a theme should still call setTheme but not saveSettings
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
    // Should not throw
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
});

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
    // Check all options are present
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
    // Find the remove button for the extra env var (contains X icon in the row)
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
    // Should not create any additional env var entries
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
});

describe("CopilotTab", () => {
  const goToCopilotTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Copilot"));
  };

  it("shows Loading when settings not loaded", () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Copilot"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows Enable GitHub Copilot checkbox unchecked by default", () => {
    goToCopilotTab();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("shows copilot error when present", () => {
    useCopilotStore.setState({ error: "Copilot init failed" });
    goToCopilotTab();
    expect(screen.getByText("Copilot init failed")).toBeInTheDocument();
  });

  it("toggles copilot on - initializes with active repo", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "test-repo", path: "/path/to/repo" } as any,
      ],
    });
    useWorkspaceStore.setState({
      activeRepoId: "repo1",
      activeWorkspaceId: null,
      workspaces: [],
    });
    goToCopilotTab();
    const checkbox = screen.getByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        copilot: { enabled: true },
      }),
    );
    expect(initialize).toHaveBeenCalledWith("file:///path/to/repo");
  });

  it("toggles copilot on - finds repo via workspace", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "test-repo", path: "/path/to/repo" } as any,
      ],
    });
    useWorkspaceStore.setState({
      activeWorkspaceId: "ws1",
      activeRepoId: null,
      workspaces: [
        { id: "ws1", name: "ws", repoId: "repo1" } as any,
      ],
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(initialize).toHaveBeenCalledWith("file:///path/to/repo");
  });

  it("toggles copilot on - no repo found doesn't crash", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({ repositories: [] });
    useWorkspaceStore.setState({
      activeRepoId: null,
      activeWorkspaceId: null,
      workspaces: [],
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(saveSettings).toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("toggles copilot off - calls shutdown", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        copilot: { enabled: true },
      },
      saveSettings,
    });
    useCopilotStore.setState({ shutdown });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(shutdown).toHaveBeenCalled();
  });

  it("shows status indicator when enabled - disconnected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "disconnected" });
    goToCopilotTab();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - connected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "connected" });
    goToCopilotTab();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - connecting", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "connecting" });
    goToCopilotTab();
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - error", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "error" });
    goToCopilotTab();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows Signed in as when authStatus has user", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: { user: "octocat" },
    });
    goToCopilotTab();
    expect(screen.getByText("Signed in as octocat")).toBeInTheDocument();
  });

  it("shows Sign In button when connected but no auth user", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
    });
    goToCopilotTab();
    expect(screen.getByText("Sign In with GitHub")).toBeInTheDocument();
  });

  it("calls signIn when Sign In button is clicked", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signIn,
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In with GitHub"));
    });
    expect(signIn).toHaveBeenCalled();
  });

  it("shows user code and Open GitHub button when signInResult has userCode", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    expect(screen.getByText("Copy Code & Open GitHub")).toBeInTheDocument();
  });

  it("handleOpenGitHub copies code and tries tauri open", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    expect(writeText).toHaveBeenCalledWith("ABCD-1234");
  });

  it("handleOpenGitHub with no userCode uses default URI", async () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "CODE-5678",
        verificationUri: null,
        user: null,
      },
    });
    goToCopilotTab();
    // Should still render and not crash
    expect(screen.getByText("Copy Code & Open GitHub")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
  });

  it("handleOpenGitHub opens via tauri shell open", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    // The @tauri-apps/plugin-shell mock will handle the open
    expect(writeText).toHaveBeenCalledWith("ABCD-1234");
  });

  it("handleOpenGitHub handles clipboard write failure gracefully", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    // Should not throw
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    windowOpen.mockRestore();
  });

  it("does not show sign in section when authUser is present", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: { user: "octocat" },
    });
    goToCopilotTab();
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("does not show sign in section when not connected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connecting",
      authStatus: null,
    });
    goToCopilotTab();
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("shows description text about ghost text", () => {
    goToCopilotTab();
    expect(
      screen.getByText(/ghost text in the editor/),
    ).toBeInTheDocument();
  });

  it("handles copilot without copilot key in settings", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        copilot: undefined as any,
      },
    });
    goToCopilotTab();
    // enabled defaults to false via ?? false
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("does not show sign-in section when not enabled", () => {
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
    });
    goToCopilotTab();
    // Copilot is disabled (default), so sign-in section should not show
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("authStatus that is not an object with user returns null authUser", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: "some-string",
    });
    goToCopilotTab();
    // authUser should be null, so Sign In button should show
    expect(screen.getByText("Sign In with GitHub")).toBeInTheDocument();
  });
});

describe("McpTab", () => {
  const noopLoadMcp = vi.fn().mockResolvedValue(undefined);

  const goToMcpTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("MCP Servers"));
  };

  it("shows loading state", () => {
    useSettingsStore.setState({ loading: true, mcpServers: [], loadMcpServers: noopLoadMcp });
    goToMcpTab();
    expect(screen.getByText(/Loading MCP servers/)).toBeInTheDocument();
  });

  it("shows empty state when no servers", () => {
    useSettingsStore.setState({ loading: false, mcpServers: [], loadMcpServers: noopLoadMcp });
    goToMcpTab();
    expect(
      screen.getByText("No MCP servers configured."),
    ).toBeInTheDocument();
  });

  it("shows server list when servers exist", () => {
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: ["-y", "mcp-server"],
          env: {},
          scope: "user" as const,
        },
      ],
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    expect(screen.getByText("my-server")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText(/npx -y mcp-server/)).toBeInTheDocument();
  });

  it("removes a server when X button is clicked", async () => {
    const removeMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: [],
          env: {},
          scope: "user" as const,
        },
      ],
      removeMcpServer,
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    const serverRow = screen.getByText("my-server").closest("div");
    const removeBtn = serverRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(removeMcpServer).toHaveBeenCalledWith({
      name: "my-server",
      scope: "user",
    });
  });

  it("shows error when remove fails", async () => {
    const removeMcpServer = vi
      .fn()
      .mockRejectedValue(new Error("Remove failed"));
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: [],
          env: {},
          scope: "user" as const,
        },
      ],
      removeMcpServer,
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    const serverRow = screen.getByText("my-server").closest("div");
    const removeBtn = serverRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Remove failed")).toBeInTheDocument();
    });
  });

  it("shows store error", () => {
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      error: "Store error message",
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    expect(screen.getByText("Store error message")).toBeInTheDocument();
  });

  it("shows add form when Add MCP Server is clicked", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    expect(
      screen.getByPlaceholderText("Server name"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Arguments (space-separated)"),
    ).toBeInTheDocument();
  });

  it("hides add form when Cancel is clicked", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    expect(
      screen.getByPlaceholderText("Server name"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(
      screen.queryByPlaceholderText("Server name"),
    ).not.toBeInTheDocument();
  });

  it("adds server successfully", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "new-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Arguments (space-separated)"),
      { target: { value: "-y @server/pkg" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).toHaveBeenCalledWith({
      name: "new-server",
      command: "npx",
      args: ["-y", "@server/pkg"],
      env: {},
      scope: "user",
    });
    // Form should be hidden after successful add
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Server name"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not add server with empty name and command", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    // Click Add Server with empty fields
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).not.toHaveBeenCalled();
  });

  it("does not add server with name but empty command", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "has-name" },
    });
    // Command is still empty
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).not.toHaveBeenCalled();
  });

  it("shows error when add server fails", async () => {
    const addMcpServer = vi
      .fn()
      .mockRejectedValue(new Error("Add failed"));
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "bad-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Add failed")).toBeInTheDocument();
    });
  });

  it("switches scope via radio buttons", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    // Default scope is "user"
    const userRadio = screen.getByLabelText("User");
    const projectRadio = screen.getByLabelText("Project");
    expect(userRadio).toBeChecked();
    expect(projectRadio).not.toBeChecked();
    fireEvent.click(projectRadio);
    expect(projectRadio).toBeChecked();
  });

  it("shows Adding... while server is being added", async () => {
    let resolverFn: () => void;
    const addPromise = new Promise<void>((resolve) => {
      resolverFn = resolve;
    });
    const addMcpServer = vi.fn().mockReturnValue(addPromise);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "test" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    fireEvent.click(screen.getByText("Add Server"));
    await waitFor(() => {
      expect(screen.getByText("Adding...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
  });

  it("adds env vars to new server form", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    // The add form has its own AddEnvVarRow
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    // Use the last one (in the add form)
    const keyInput = keyInputs[keyInputs.length - 1];
    const valueInput = valueInputs[valueInputs.length - 1];
    fireEvent.change(keyInput, { target: { value: "SERVER_TOKEN" } });
    fireEvent.change(valueInput, { target: { value: "abc123" } });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(screen.getByText("SERVER_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("removes env var from new server form", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    // Add an env var first
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    const keyInput = keyInputs[keyInputs.length - 1];
    const valueInput = valueInputs[valueInputs.length - 1];
    fireEvent.change(keyInput, { target: { value: "REMOVE_ME" } });
    fireEvent.change(valueInput, { target: { value: "val" } });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(screen.getByText("REMOVE_ME")).toBeInTheDocument();
    // Find the remove button in the env var entry
    const envRow = screen.getByText("REMOVE_ME").closest("div");
    const removeBtn = envRow!.querySelector("button");
    fireEvent.click(removeBtn!);
    expect(screen.queryByText("REMOVE_ME")).not.toBeInTheDocument();
  });

  it("adds server with env vars", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "env-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "node" } },
    );
    // Add env var
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: "API_KEY" },
    });
    fireEvent.change(valueInputs[valueInputs.length - 1], {
      target: { value: "secret" },
    });
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[addBtns.length - 1]);
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { API_KEY: "secret" },
      }),
    );
  });
});

describe("MigrationTab", () => {
  const noopCheckCursor = vi.fn().mockResolvedValue(undefined);

  const goToMigrationTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Migration"));
  };

  it("shows Checking status when cursorDetected is null", () => {
    useSettingsStore.setState({ cursorDetected: null, checkCursorConfig: noopCheckCursor });
    goToMigrationTab();
    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows detected when cursorDetected is true", () => {
    useSettingsStore.setState({ cursorDetected: true, checkCursorConfig: noopCheckCursor });
    goToMigrationTab();
    expect(
      screen.getByText(/Cursor config detected/),
    ).toBeInTheDocument();
  });

  it("shows not found when cursorDetected is false", () => {
    useSettingsStore.setState({ cursorDetected: false });
    goToMigrationTab();
    expect(screen.getByText("No Cursor config found")).toBeInTheDocument();
  });

  it("Import button is disabled when cursorDetected is false", () => {
    useSettingsStore.setState({ cursorDetected: false });
    goToMigrationTab();
    const importBtn = screen.getByText("Import MCP Servers");
    expect(importBtn).toBeDisabled();
  });

  it("imports MCP servers when button is clicked", async () => {
    const importCursor = vi.fn().mockResolvedValue({
      mcpServersFound: 3,
      mcpServersImported: 2,
      rulesFound: false,
    });
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Import MCP Servers"));
    });
    expect(importCursor).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Imported 2 of 3 MCP servers/)).toBeInTheDocument();
    });
  });

  it("shows Importing... while importing", async () => {
    let resolverFn: (v: any) => void;
    const importPromise = new Promise((resolve) => {
      resolverFn = resolve;
    });
    const importCursor = vi.fn().mockReturnValue(importPromise);
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    fireEvent.click(screen.getByText("Import MCP Servers"));
    await waitFor(() => {
      expect(screen.getByText("Importing...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!({
        mcpServersFound: 1,
        mcpServersImported: 1,
        rulesFound: false,
      });
    });
  });

  it("shows error when import fails", async () => {
    const importCursor = vi
      .fn()
      .mockRejectedValue(new Error("Import failed"));
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Import MCP Servers"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("Error: Import failed"),
      ).toBeInTheDocument();
    });
  });

  it("shows repository selector for cursorrules", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
        { id: "repo2", name: "other-repo", path: "/other" } as any,
      ],
    });
    goToMigrationTab();
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    expect(screen.getByText("my-repo")).toBeInTheDocument();
    expect(screen.getByText("other-repo")).toBeInTheDocument();
  });

  it("detects cursorrules when repo is selected", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(mockDetectCursorrules).toHaveBeenCalledWith("repo1");
      expect(screen.getByText(".cursorrules found")).toBeInTheDocument();
    });
  });

  it("shows not found when cursorrules not detected", async () => {
    mockDetectCursorrules.mockResolvedValue(false);
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(
        screen.getByText("No .cursorrules file in this repo"),
      ).toBeInTheDocument();
    });
  });

  it("shows Checking... while detecting cursorrules", async () => {
    let resolverFn: (v: boolean) => void;
    mockDetectCursorrules.mockImplementation(
      () => new Promise((resolve) => {
        resolverFn = resolve;
      }),
    );
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    // While the promise is pending, "Checking..." should show
    await waitFor(() => {
      // There may be two "Checking..." texts - one for cursor config, one for rules
      const checkingTexts = screen.getAllByText("Checking...");
      expect(checkingTexts.length).toBeGreaterThanOrEqual(1);
    });
    await act(async () => {
      resolverFn!(true);
    });
  });

  it("handles detectCursorrules error by setting false", async () => {
    mockDetectCursorrules.mockRejectedValue(new Error("detect error"));
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(
        screen.getByText("No .cursorrules file in this repo"),
      ).toBeInTheDocument();
    });
  });

  it("converts cursorrules to CLAUDE.md", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: false,
      written: true,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(
        screen.getByText("Convert to CLAUDE.md"),
      ).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    expect(mockImportCursorrules).toHaveBeenCalledWith("repo1", false);
    await waitFor(() => {
      expect(
        screen.getByText(/CLAUDE\.md created at \/repo\/CLAUDE\.md/),
      ).toBeInTheDocument();
    });
  });

  it("shows merged message when claudeMdExisted is true and written", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: true,
      written: true,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/CLAUDE\.md merged at \/repo\/CLAUDE\.md/),
      ).toBeInTheDocument();
    });
  });

  it("shows existing CLAUDE.md warning and merge button", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: true,
      written: false,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/CLAUDE\.md already exists/),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Merge into existing CLAUDE.md"),
      ).toBeInTheDocument();
    });
  });

  it("merge button calls importCursorrules with overwrite=true", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    // First call returns existing, not written
    mockImportCursorrules
      .mockResolvedValueOnce({
        rulesFound: true,
        claudeMdExisted: true,
        written: false,
        claudeMdPath: "/repo/CLAUDE.md",
      })
      .mockResolvedValueOnce({
        rulesFound: true,
        claudeMdExisted: true,
        written: true,
        claudeMdPath: "/repo/CLAUDE.md",
      });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("Merge into existing CLAUDE.md"),
      ).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Merge into existing CLAUDE.md"));
    });
    expect(mockImportCursorrules).toHaveBeenLastCalledWith("repo1", true);
  });

  it("shows rules import error", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockRejectedValue(new Error("Import rules failed"));
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("Error: Import rules failed"),
      ).toBeInTheDocument();
    });
  });

  it("shows Converting... while rules import is in progress", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    let resolverFn: (v: any) => void;
    mockImportCursorrules.mockImplementation(
      () => new Promise((resolve) => {
        resolverFn = resolve;
      }),
    );
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    await waitFor(() => {
      expect(screen.getByText("Converting...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!({
        rulesFound: true,
        claudeMdExisted: false,
        written: true,
        claudeMdPath: "/repo/CLAUDE.md",
      });
    });
  });

  it("shows No .cursorrules found when result is not written and claudeMdExisted is false", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: false,
      claudeMdExisted: false,
      written: false,
      claudeMdPath: "",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("No .cursorrules found."),
      ).toBeInTheDocument();
    });
  });

  it("does not call handleRulesImport when no repo is selected", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    goToMigrationTab();
    // No repo selected, so convert button shouldn't even show
    expect(
      screen.queryByText("Convert to CLAUDE.md"),
    ).not.toBeInTheDocument();
  });

  it("shows helper text at the bottom", () => {
    goToMigrationTab();
    expect(
      screen.getByText(/Import MCP servers from Cursor/),
    ).toBeInTheDocument();
  });
});

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
    // First checkbox is Spotlight Testing
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
    // Second checkbox is Agent Teams
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
    expect(
      screen.getByText(/experimental and may change/),
    ).toBeInTheDocument();
  });

  it("shows descriptions for experimental features", () => {
    goToExperimentalTab();
    expect(
      screen.getByText(/Watch workspace worktree/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Make agents aware of sibling workspaces/),
    ).toBeInTheDocument();
  });

  it("handles saveSettings finally block (sets saving false)", async () => {
    // Use a slow-resolving mock to test that saving state resets via finally block
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
    // While saving, checkbox should be disabled
    await waitFor(() => {
      expect(checkboxes[0]).toBeDisabled();
    });
    // Resolve the save promise
    await act(async () => {
      resolverFn!();
    });
    // After resolving, saving should be false and checkboxes should not be disabled
    await waitFor(() => {
      expect(checkboxes[0]).not.toBeDisabled();
    });
  });
});

describe("UpdatesTab", () => {
  const goToUpdatesTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Updates"));
  };

  it("shows current version", () => {
    goToUpdatesTab();
    expect(screen.getByText("Current version: v0.1.0")).toBeInTheDocument();
  });

  it("shows Check for Updates button", () => {
    goToUpdatesTab();
    expect(screen.getByText("Check for Updates")).toBeInTheDocument();
  });

  it("shows Checking... while checking for updates", async () => {
    let resolverFn: () => void;
    mockUpdaterCheck.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolverFn = () => resolve(null);
        }),
    );

    goToUpdatesTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Check for Updates"));
    });
    await waitFor(() => {
      expect(screen.getByText("Checking...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
  });

  it("shows latest version message when no update available", async () => {
    mockUpdaterCheck.mockResolvedValue(null);

    goToUpdatesTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Check for Updates"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("You are on the latest version."),
      ).toBeInTheDocument();
    });
  });

  it("shows update available and installs", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    mockUpdaterCheck.mockResolvedValue({
      version: "1.0.0",
      downloadAndInstall,
    });

    goToUpdatesTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Check for Updates"));
    });
    await waitFor(() => {
      expect(
        screen.getByText("Update installed. Restart the app to apply."),
      ).toBeInTheDocument();
    });
    expect(downloadAndInstall).toHaveBeenCalled();
  });

  it("shows error when update check fails", async () => {
    mockUpdaterCheck.mockRejectedValue(new Error("Network error"));

    goToUpdatesTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Check for Updates"));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Update check failed/),
      ).toBeInTheDocument();
    });
  });

  it("shows helper text about updates", () => {
    goToUpdatesTab();
    expect(
      screen.getByText(/Updates are downloaded from GitHub Releases/),
    ).toBeInTheDocument();
  });
});
