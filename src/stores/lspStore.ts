import { create } from "zustand";
import {
  type LspCatalogEntry,
  type LspPlugin,
  getLspCatalog,
  listLspPlugins,
  installLspPlugin as installLspPluginCmd,
  uninstallLspPlugin as uninstallLspPluginCmd,
} from "../lib/tauri";

interface LspStore {
  catalog: LspCatalogEntry[];
  installedPlugins: LspPlugin[];
  loading: boolean;
  error: string | null;
  installingPlugins: string[];

  loadCatalog: () => Promise<void>;
  loadInstalledPlugins: () => Promise<void>;
  installPlugin: (pluginName: string, scope: string) => Promise<void>;
  uninstallPlugin: (pluginName: string, scope: string) => Promise<void>;
}

export const useLspStore = create<LspStore>((set, get) => ({
  catalog: [],
  installedPlugins: [],
  loading: false,
  error: null,
  installingPlugins: [],

  loadCatalog: async () => {
    try {
      const catalog = await getLspCatalog();
      set({ catalog });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadInstalledPlugins: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await listLspPlugins();
      set({ installedPlugins: plugins, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  installPlugin: async (pluginName: string, scope: string) => {
    set({
      error: null,
      installingPlugins: [...get().installingPlugins, pluginName],
    });
    try {
      await installLspPluginCmd({ pluginName, scope });
      await get().loadInstalledPlugins();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({
        installingPlugins: get().installingPlugins.filter(
          (n) => n !== pluginName,
        ),
      });
    }
  },

  uninstallPlugin: async (pluginName: string, scope: string) => {
    set({ error: null });
    try {
      await uninstallLspPluginCmd({ pluginName, scope });
      await get().loadInstalledPlugins();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
