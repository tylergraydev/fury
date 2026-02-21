import { create } from "zustand";
import {
  type AppSettings,
  type McpServer,
  type CursorMigrationResult,
  type AddMcpRequest,
  type RemoveMcpRequest,
  getAppSettings,
  updateAppSettings,
  listMcpServers,
  addMcpServer as addMcpServerCmd,
  removeMcpServer as removeMcpServerCmd,
  detectCursorConfig,
  importCursorConfig,
} from "../lib/tauri";

interface SettingsStore {
  appSettings: AppSettings | null;
  mcpServers: McpServer[];
  cursorDetected: boolean | null;
  loading: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadMcpServers: (scope?: string) => Promise<void>;
  addMcpServer: (request: AddMcpRequest) => Promise<void>;
  removeMcpServer: (request: RemoveMcpRequest) => Promise<void>;
  checkCursorConfig: () => Promise<void>;
  importCursor: () => Promise<CursorMigrationResult>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  appSettings: null,
  mcpServers: [],
  cursorDetected: null,
  loading: false,
  error: null,

  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await getAppSettings();
      set({ appSettings: settings, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    set({ error: null });
    try {
      await updateAppSettings(settings);
      set({ appSettings: settings });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  loadMcpServers: async (scope?: string) => {
    set({ loading: true, error: null });
    try {
      const servers = await listMcpServers(scope);
      set({ mcpServers: servers, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addMcpServer: async (request: AddMcpRequest) => {
    set({ error: null });
    try {
      await addMcpServerCmd(request);
      await get().loadMcpServers();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  removeMcpServer: async (request: RemoveMcpRequest) => {
    set({ error: null });
    try {
      await removeMcpServerCmd(request);
      await get().loadMcpServers();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  checkCursorConfig: async () => {
    try {
      const detected = await detectCursorConfig();
      set({ cursorDetected: detected });
    } catch {
      set({ cursorDetected: false });
    }
  },

  importCursor: async () => {
    set({ error: null });
    try {
      const result = await importCursorConfig();
      await get().loadMcpServers();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
