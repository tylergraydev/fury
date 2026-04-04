import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  AppSettings,
  LspCatalogEntry,
  LspPlugin,
  InstallLspPluginRequest,
  UninstallLspPluginRequest,
  LspSuggestion,
  McpServer,
  AddMcpRequest,
  RemoveMcpRequest,
  CursorMigrationResult,
  CursorRulesImportResult,
  IndexingStatus,
  SlashCommand,
} from "./bindings.generated";

// LSP Plugin commands
export async function getLspCatalog(): Promise<LspCatalogEntry[]> {
  return invoke<LspCatalogEntry[]>("get_lsp_catalog");
}

export async function listLspPlugins(): Promise<LspPlugin[]> {
  return invoke<LspPlugin[]>("list_lsp_plugins");
}

export async function installLspPlugin(
  request: InstallLspPluginRequest,
): Promise<void> {
  return invoke("install_lsp_plugin", { request });
}

export async function uninstallLspPlugin(
  request: UninstallLspPluginRequest,
): Promise<void> {
  return invoke("uninstall_lsp_plugin", { request });
}

export async function detectLspSuggestions(
  repoPath: string,
): Promise<LspSuggestion[]> {
  return invoke<LspSuggestion[]>("detect_lsp_suggestions", { repoPath });
}

// MCP commands
export async function listMcpServers(
  scope?: string,
): Promise<McpServer[]> {
  return invoke<McpServer[]>("list_mcp_servers", { scope });
}

export async function addMcpServer(
  request: AddMcpRequest,
): Promise<void> {
  return invoke("add_mcp_server", { request });
}

export async function removeMcpServer(
  request: RemoveMcpRequest,
): Promise<void> {
  return invoke("remove_mcp_server", { request });
}

export async function detectCursorConfig(): Promise<boolean> {
  return invoke<boolean>("detect_cursor_config");
}

export async function importCursorConfig(): Promise<CursorMigrationResult> {
  return invoke<CursorMigrationResult>("import_cursor_config");
}

// App settings commands
export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(
  settings: AppSettings,
): Promise<void> {
  return invoke("update_app_settings", { settings });
}

// Last active context persistence
export async function getLastActiveContext(): Promise<[string | null, string | null]> {
  return invoke<[string | null, string | null]>("get_last_active_context");
}

export async function saveLastActiveContext(
  workspaceId: string | null,
  repoId: string | null,
): Promise<void> {
  return invoke("save_last_active_context", { workspaceId, repoId });
}

// Claude Context indexing commands
export async function indexRepository(repoId: string): Promise<void> {
  return invoke("index_repository", { repoId });
}

export async function getIndexingStatus(
  repoId: string,
): Promise<IndexingStatus> {
  return invoke<IndexingStatus>("get_indexing_status", { repoId });
}

export async function listIndexingStatuses(): Promise<IndexingStatus[]> {
  return invoke<IndexingStatus[]>("list_indexing_statuses");
}

// Cursorrules commands
export async function detectCursorrules(
  repoId: string,
): Promise<boolean> {
  return invoke<boolean>("detect_cursorrules", { repoId });
}

export async function importCursorrules(
  repoId: string,
  overwrite: boolean,
): Promise<CursorRulesImportResult> {
  return invoke<CursorRulesImportResult>("import_cursorrules", {
    repoId,
    overwrite,
  });
}

// Slash command commands
export async function listSlashCommands(
  contextId: string,
  contextType: "workspace" | "repo" = "workspace",
): Promise<SlashCommand[]> {
  return invoke<SlashCommand[]>("list_slash_commands", { contextId, contextType });
}

export async function getSlashCommandContent(
  workspaceId: string,
  name: string,
): Promise<SlashCommand | null> {
  return invoke<SlashCommand | null>("get_slash_command_content", {
    workspaceId,
    name,
  });
}
