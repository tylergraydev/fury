import { create } from "zustand";
import {
  type SlashCommand,
  listSlashCommands as listSlashCommandsCmd,
} from "../lib/tauri";

interface SlashCommandStore {
  commands: Record<string, SlashCommand[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadCommands: (workspaceId: string) => Promise<void>;
  getCommands: (workspaceId: string) => SlashCommand[];
  findMatching: (workspaceId: string, prefix: string) => SlashCommand[];
}

export const useSlashCommandStore = create<SlashCommandStore>((set, get) => ({
  commands: {},
  loading: {},
  error: {},

  loadCommands: async (workspaceId: string) => {
    if (get().loading[workspaceId]) return;
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
    }));
    try {
      const cmds = await listSlashCommandsCmd(workspaceId);
      set((s) => ({
        commands: { ...s.commands, [workspaceId]: cmds },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      console.error(`[slashCommandStore] Failed to load commands:`, e);
      set((s) => ({
        loading: { ...s.loading, [workspaceId]: false },
        error: { ...s.error, [workspaceId]: String(e) },
      }));
    }
  },

  getCommands: (workspaceId: string) => {
    return get().commands[workspaceId] ?? [];
  },

  findMatching: (workspaceId: string, prefix: string) => {
    const cmds = get().commands[workspaceId] ?? [];
    if (!prefix) return cmds;
    const lower = prefix.toLowerCase();
    return cmds.filter((c) => c.name.toLowerCase().startsWith(lower));
  },
}));
