import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type ScriptKind,
  type ScriptOutputEvent,
  type ScriptExitEvent,
  runScript as runScriptCmd,
  stopScript as stopScriptCmd,
} from "../lib/tauri";

interface ScriptStore {
  output: Record<string, string[]>;
  running: Record<string, boolean>;
  exitCodes: Record<string, number | null>;
  subscriptions: Record<string, UnlistenFn[]>;

  subscribe: (workspaceId: string, kind: ScriptKind) => Promise<void>;
  unsubscribe: (workspaceId: string, kind: ScriptKind) => void;
  runScript: (workspaceId: string, kind: ScriptKind) => Promise<void>;
  stopScript: (workspaceId: string, kind: ScriptKind) => Promise<void>;
  clearOutput: (workspaceId: string, kind: ScriptKind) => void;
  getOutput: (workspaceId: string, kind: ScriptKind) => string[];
  isRunning: (workspaceId: string, kind: ScriptKind) => boolean;
}

function key(workspaceId: string, kind: ScriptKind): string {
  return `${workspaceId}:${kind}`;
}

export const useScriptStore = create<ScriptStore>((set, get) => ({
  output: {},
  running: {},
  exitCodes: {},
  subscriptions: {},

  subscribe: async (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    if (get().subscriptions[k]) return;

    const unlistenOutput = await listen<ScriptOutputEvent>(
      `script-output:${kind}:${workspaceId}`,
      (event) => {
        const prefix =
          event.payload.stream === "stderr" ? "[stderr] " : "";
        set((state) => ({
          output: {
            ...state.output,
            [k]: [...(state.output[k] ?? []), prefix + event.payload.line],
          },
        }));
      },
    );

    const unlistenExit = await listen<ScriptExitEvent>(
      `script-exit:${kind}:${workspaceId}`,
      (event) => {
        set((state) => ({
          running: { ...state.running, [k]: false },
          exitCodes: { ...state.exitCodes, [k]: event.payload.exitCode },
        }));
      },
    );

    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [k]: [unlistenOutput, unlistenExit],
      },
    }));
  },

  unsubscribe: (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    const unsubs = get().subscriptions[k];
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      set((state) => {
        const { [k]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
  },

  runScript: async (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    set((state) => ({
      running: { ...state.running, [k]: true },
      exitCodes: { ...state.exitCodes, [k]: undefined as unknown as null },
      output: { ...state.output, [k]: [] },
    }));
    await runScriptCmd(workspaceId, kind);
  },

  stopScript: async (workspaceId: string, kind: ScriptKind) => {
    await stopScriptCmd(workspaceId, kind);
  },

  clearOutput: (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    set((state) => ({
      output: { ...state.output, [k]: [] },
      exitCodes: { ...state.exitCodes, [k]: undefined as unknown as null },
    }));
  },

  getOutput: (workspaceId: string, kind: ScriptKind): string[] => {
    return get().output[key(workspaceId, kind)] ?? [];
  },

  isRunning: (workspaceId: string, kind: ScriptKind): boolean => {
    return get().running[key(workspaceId, kind)] ?? false;
  },
}));
