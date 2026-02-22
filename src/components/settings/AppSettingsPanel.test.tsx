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

import { AppSettingsPanel } from "./AppSettingsPanel";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { useCopilotStore } from "../../stores/copilotStore";

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
  detectCursorrules: vi.fn().mockResolvedValue(false),
  importCursorrules: vi.fn().mockResolvedValue({ success: true }),
  migrateCursorConfig: vi.fn().mockResolvedValue({ success: true }),
  listen: vi.fn().mockResolvedValue(() => {}),
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listMcpServers: vi.fn().mockResolvedValue([]),
  checkCursorConfig: vi.fn().mockResolvedValue(false),
}));

const fullSettings = {
  theme: "blend" as const,
  provider: { providerType: "Anthropic" as const, envVars: {} },
  systemPromptAdditions: null,
  analyticsEnabled: false,
  experimental: { spotlightTesting: false, agentTeams: false },
  copilot: { enabled: false },
};

beforeEach(() => {
  useSettingsStore.setState({
    appSettings: fullSettings,
    loading: false,
    error: null,
  });
  useUIStore.setState({
    theme: "blend",
  });
  useCopilotStore.setState({
    connectionStatus: "disconnected",
  });
  vi.clearAllMocks();
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
    // ProviderTab loads settings in useEffect, then shows the provider select
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
});
