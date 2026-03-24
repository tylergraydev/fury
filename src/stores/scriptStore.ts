import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type ScriptKind,
  type ScriptOutputEvent,
  type ScriptExitEvent,
  runScript as runScriptCmd,
  stopScript as stopScriptCmd,
  runRepoScript as runRepoScriptCmd,
  stopRepoScript as stopRepoScriptCmd,
} from "../lib/tauri";

interface ScriptStore {
  output: Record<string, string[]>;
  running: Record<string, boolean>;
  exitCodes: Record<string, number | null>;
  userStopped: Record<string, boolean>;
  subscriptions: Record<string, UnlistenFn[]>;

  subscribe: (contextId: string, kind: ScriptKind) => Promise<void>;
  unsubscribe: (contextId: string, kind: ScriptKind) => void;
  runScript: (workspaceId: string, kind: ScriptKind) => Promise<void>;
  stopScript: (workspaceId: string, kind: ScriptKind) => Promise<void>;
  runRepoScript: (repoId: string, kind: ScriptKind) => Promise<void>;
  stopRepoScript: (repoId: string, kind: ScriptKind) => Promise<void>;
  clearOutput: (contextId: string, kind: ScriptKind) => void;
  getOutput: (contextId: string, kind: ScriptKind) => string[];
  isRunning: (contextId: string, kind: ScriptKind) => boolean;
}

const MAX_OUTPUT_LINES = 5000;

function key(workspaceId: string, kind: ScriptKind): string {
  return `${workspaceId}:${kind}`;
}

export const useScriptStore = create<ScriptStore>((set, get) => ({
  output: {},
  running: {},
  exitCodes: {},
  userStopped: {},
  subscriptions: {},

  subscribe: async (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    if (get().subscriptions[k]) return;

    const unlistenOutput = await listen<ScriptOutputEvent>(
      `script-output:${kind}:${workspaceId}`,
      (event) => {
        const prefix =
          event.payload.stream === "stderr" ? "[stderr] " : "";
        set((state) => {
          const currentOutput = state.output[k] ?? [];
          const newOutput = [...currentOutput, prefix + event.payload.line];
          const trimmed = newOutput.length > MAX_OUTPUT_LINES
            ? newOutput.slice(-MAX_OUTPUT_LINES)
            : newOutput;
          return {
            output: {
              ...state.output,
              [k]: trimmed,
            },
          };
        });
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
      exitCodes: { ...state.exitCodes, [k]: null },
      userStopped: { ...state.userStopped, [k]: false },
      output: { ...state.output, [k]: [] },
    }));
    try {
      await runScriptCmd(workspaceId, kind);
    } catch (e) {
      set((state) => ({
        running: { ...state.running, [k]: false },
        output: {
          ...state.output,
          [k]: [...(state.output[k] ?? []), `[error] Failed to start script: ${String(e)}`],
        },
      }));
    }
  },

  stopScript: async (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    set((state) => ({
      userStopped: { ...state.userStopped, [k]: true },
    }));
    try {
      await stopScriptCmd(workspaceId, kind);
    } catch (e) {
      console.error(`[scriptStore] Failed to stop script:`, e);
    }
  },

  runRepoScript: async (repoId: string, kind: ScriptKind) => {
    const k = key(repoId, kind);
    set((state) => ({
      running: { ...state.running, [k]: true },
      exitCodes: { ...state.exitCodes, [k]: null },
      userStopped: { ...state.userStopped, [k]: false },
      output: { ...state.output, [k]: [] },
    }));
    try {
      await runRepoScriptCmd(repoId, kind);
    } catch (e) {
      set((state) => ({
        running: { ...state.running, [k]: false },
        output: {
          ...state.output,
          [k]: [...(state.output[k] ?? []), `[error] Failed to start script: ${String(e)}`],
        },
      }));
    }
  },

  stopRepoScript: async (repoId: string, kind: ScriptKind) => {
    const k = key(repoId, kind);
    set((state) => ({
      userStopped: { ...state.userStopped, [k]: true },
    }));
    try {
      await stopRepoScriptCmd(repoId, kind);
    } catch (e) {
      console.error(`[scriptStore] Failed to stop repo script:`, e);
    }
  },

  clearOutput: (workspaceId: string, kind: ScriptKind) => {
    const k = key(workspaceId, kind);
    set((state) => ({
      output: { ...state.output, [k]: [] },
      exitCodes: { ...state.exitCodes, [k]: null },
      userStopped: { ...state.userStopped, [k]: false },
    }));
  },

  getOutput: (workspaceId: string, kind: ScriptKind): string[] => {
    return get().output[key(workspaceId, kind)] ?? [];
  },

  isRunning: (workspaceId: string, kind: ScriptKind): boolean => {
    return get().running[key(workspaceId, kind)] ?? false;
  },
}));
