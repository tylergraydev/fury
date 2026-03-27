import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

vi.mock("../../lib/autoUpdate", () => ({
  checkForAppUpdate: vi.fn().mockResolvedValue(null),
  getAppVersion: vi.fn().mockResolvedValue("1.4.1"),
}));

const mockDetectCursorrules = vi.fn().mockResolvedValue(false);
const mockImportCursorrules = vi.fn().mockResolvedValue({
  rulesFound: true,
  claudeMdExisted: false,
  written: true,
  claudeMdPath: "/repo/CLAUDE.md",
});
const mockIndexRepository = vi.fn().mockResolvedValue(undefined);
const mockListIndexingStatuses = vi.fn().mockResolvedValue([]);

vi.mock("../../lib/tauri", () => ({
  loadSettings: vi.fn().mockResolvedValue({
    theme: "blend",
    provider: { providerType: "Anthropic", envVars: {} },
    systemPromptAdditions: null,
    analyticsEnabled: false,
    experimental: { spotlightTesting: false, agentTeams: false, persistentProcesses: false, safeMode: false },
    copilot: { enabled: false },
    linear: { apiKey: null },
    claudeContext: { enabled: false, openaiApiKey: null, zillizUri: null, zillizToken: null },
  }),
  getAppSettings: vi.fn().mockResolvedValue({
    theme: "blend",
    provider: { providerType: "Anthropic", envVars: {} },
    systemPromptAdditions: null,
    analyticsEnabled: false,
    experimental: { spotlightTesting: false, agentTeams: false, persistentProcesses: false, safeMode: false },
    copilot: { enabled: false },
    linear: { apiKey: null },
    claudeContext: { enabled: false, openaiApiKey: null, zillizUri: null, zillizToken: null },
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
  indexRepository: (...args: unknown[]) => mockIndexRepository(...args),
  listIndexingStatuses: (...args: unknown[]) => mockListIndexingStatuses(...args),
  getLspCatalog: vi.fn().mockResolvedValue([]),
  listLspPlugins: vi.fn().mockResolvedValue([]),
  installLspPlugin: vi.fn().mockResolvedValue(undefined),
  uninstallLspPlugin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/keybindings", () => ({
  isMac: false,
}));

vi.mock("./ThemeEditorModal", () => ({
  ThemeEditorModal: ({ onClose, onSave, existingTheme, duplicateFrom }: any) => (
    <div data-testid="theme-editor-modal">
      <span data-testid="editing-theme">{existingTheme?.id ?? "null"}</span>
      <span data-testid="duplicate-from">{duplicateFrom ?? "null"}</span>
      <button onClick={onClose}>CloseEditor</button>
      <button onClick={() => onSave({ id: "custom-new", name: "New Theme", vars: { "--bg-primary": "#111" } })}>
        SaveTheme
      </button>
      <button onClick={() => onSave({ id: existingTheme?.id ?? "custom-new", name: "Updated", vars: { "--bg-primary": "#222" } })}>
        SaveExisting
      </button>
    </div>
  ),
}));

vi.mock("./UpdateDialog", () => ({
  UpdateDialog: ({ onClose }: any) => (
    <div data-testid="update-dialog">
      <span>Software Update</span>
      <button onClick={onClose}>CloseUpdateDialog</button>
    </div>
  ),
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
  CircleDot: () => <span data-testid="circle-dot-icon" />,
  Search: () => <span data-testid="search-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
  Pencil: () => <span data-testid="pencil-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
  Blocks: () => <span data-testid="blocks-icon" />,
  Check: () => <span data-testid="check-icon-lsp" />,
  AlertTriangle: () => <span data-testid="alert-triangle-icon" />,
  CheckCircle: () => <span data-testid="check-circle-icon" />,
  RotateCcw: () => <span data-testid="rotate-icon" />,
  ShieldCheck: () => <span data-testid="shield-check-icon" />,
  ShieldX: () => <span data-testid="shield-x-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
}));

const fullSettings = {
  agentType: "claude_code" as const,
  theme: "blend" as const,
  provider: {
    providerType: "Anthropic" as const,
    envVars: {} as Record<string, string>,
  },
  systemPromptAdditions: null,
  analyticsEnabled: false,
  experimental: { spotlightTesting: false, agentTeams: false, persistentProcesses: false, safeMode: false },
  copilot: { enabled: false },
  linear: { apiKey: null },
  claudeContext: { enabled: false, openaiApiKey: null, zillizUri: null, zillizToken: null },
  azureDevops: { pat: null, defaultOrg: null },
  customThemes: [],
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
  mockIndexRepository.mockResolvedValue(undefined);
  mockListIndexingStatuses.mockResolvedValue([]);
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

describe("settingsInitialTab", () => {
  it("clears settingsInitialTab on mount when set", () => {
    const setSettingsInitialTab = vi.fn();
    useUIStore.setState({
      settingsInitialTab: "code-intel",
      setSettingsInitialTab,
    } as any);
    render(<AppSettingsPanel />);
    expect(setSettingsInitialTab).toHaveBeenCalledWith(null);
  });
});
