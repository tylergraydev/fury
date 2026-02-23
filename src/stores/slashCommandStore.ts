import { create } from "zustand";
import {
  type SlashCommand,
  listSlashCommands as listSlashCommandsCmd,
} from "../lib/tauri";

interface SlashCommandStore {
  commands: Record<string, SlashCommand[]>;
  discoveredSkills: Record<string, SlashCommand[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadCommands: (contextId: string, contextType?: "workspace" | "repo") => Promise<void>;
  addDiscoveredSkills: (contextId: string, skills: SlashCommand[]) => void;
  getCommands: (contextId: string) => SlashCommand[];
  findMatching: (contextId: string, prefix: string) => SlashCommand[];
}

export const useSlashCommandStore = create<SlashCommandStore>((set, get) => ({
  commands: {},
  discoveredSkills: {},
  loading: {},
  error: {},

  loadCommands: async (contextId: string, contextType: "workspace" | "repo" = "workspace") => {
    if (get().loading[contextId]) return;
    set((s) => ({
      loading: { ...s.loading, [contextId]: true },
      error: { ...s.error, [contextId]: null },
    }));
    try {
      const cmds = await listSlashCommandsCmd(contextId, contextType);
      set((s) => ({
        commands: { ...s.commands, [contextId]: cmds },
        loading: { ...s.loading, [contextId]: false },
      }));
    } catch (e) {
      console.error(`[slashCommandStore] Failed to load commands:`, e);
      set((s) => ({
        loading: { ...s.loading, [contextId]: false },
        error: { ...s.error, [contextId]: String(e) },
      }));
    }
  },

  addDiscoveredSkills: (contextId: string, skills: SlashCommand[]) => {
    set((s) => ({
      discoveredSkills: { ...s.discoveredSkills, [contextId]: skills },
    }));
  },

  getCommands: (contextId: string) => {
    return get().commands[contextId] ?? [];
  },

  findMatching: (contextId: string, prefix: string) => {
    const cmds = get().commands[contextId] ?? [];
    if (!prefix) return cmds;
    const lower = prefix.toLowerCase();
    return cmds.filter((c) => c.name.toLowerCase().startsWith(lower));
  },
}));
