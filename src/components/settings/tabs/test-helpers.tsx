import { vi, beforeEach } from "vitest";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";
import { useCopilotStore } from "../../../stores/copilotStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../../lib/monacoSetup", () => ({ ensureTypesLoaded: vi.fn() }));
vi.mock("../../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
}));

vi.mock("../../../lib/autoUpdate", () => ({
  checkForAppUpdate: vi.fn().mockResolvedValue(null),
  getAppVersion: vi.fn().mockResolvedValue("1.4.1"),
}));

export const mockDetectCursorrules = vi.fn().mockResolvedValue(false);
export const mockImportCursorrules = vi.fn().mockResolvedValue({
  rulesFound: true,
  claudeMdExisted: false,
  written: true,
  claudeMdPath: "/repo/CLAUDE.md",
});
export const mockIndexRepository = vi.fn().mockResolvedValue(undefined);
export const mockListIndexingStatuses = vi.fn().mockResolvedValue([]);

vi.mock("../../../lib/tauri", () => ({
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

vi.mock("../../../lib/keybindings", () => ({
  isMac: false,
}));

vi.mock("../ThemeEditorModal", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

vi.mock("../UpdateDialog", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  UpdateDialog: ({ onClose }: any) => (
    <div data-testid="update-dialog">
      <span>Software Update</span>
      <button onClick={onClose}>CloseUpdateDialog</button>
    </div>
  ),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

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
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  GitCompare: () => <span data-testid="icon-gitcompare" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

}));

export const fullSettings = {
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
