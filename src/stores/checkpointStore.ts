import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type Checkpoint,
  listCheckpoints as listCheckpointsCmd,
  revertToCheckpoint as revertToCheckpointCmd,
} from "../lib/tauri";

interface CheckpointStore {
  checkpoints: Record<string, Checkpoint[]>;
  subscriptions: Record<string, UnlistenFn[]>;
  revertedTurnIndex: Record<string, number | null>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  loadCheckpoints: (workspaceId: string) => Promise<void>;
  revertToCheckpoint: (
    workspaceId: string,
    checkpointId: string,
  ) => Promise<void>;
  getCheckpoints: (workspaceId: string) => Checkpoint[];
  getRevertedTurnIndex: (workspaceId: string) => number | null;
}

export const useCheckpointStore = create<CheckpointStore>((set, get) => ({
  checkpoints: {},
  subscriptions: {},
  revertedTurnIndex: {},

  subscribe: async (workspaceId: string) => {
    if (get().subscriptions[workspaceId]) return;

    const unlistenCreated = await listen<Checkpoint>(
      `checkpoint-created:${workspaceId}`,
      (event) => {
        set((state) => ({
          checkpoints: {
            ...state.checkpoints,
            [workspaceId]: [
              ...(state.checkpoints[workspaceId] ?? []),
              event.payload,
            ],
          },
        }));
      },
    );

    const unlistenReverted = await listen<{ turnIndex: number }>(
      `checkpoint-reverted:${workspaceId}`,
      (event) => {
        set((state) => ({
          checkpoints: {
            ...state.checkpoints,
            [workspaceId]: (state.checkpoints[workspaceId] ?? []).filter(
              (cp) => cp.turnIndex <= event.payload.turnIndex,
            ),
          },
          revertedTurnIndex: {
            ...state.revertedTurnIndex,
            [workspaceId]: event.payload.turnIndex,
          },
        }));
      },
    );

    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [workspaceId]: [unlistenCreated, unlistenReverted],
      },
    }));
  },

  unsubscribe: (workspaceId: string) => {
    const unsubs = get().subscriptions[workspaceId];
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
  },

  loadCheckpoints: async (workspaceId: string) => {
    try {
      const checkpoints = await listCheckpointsCmd(workspaceId);
      set((state) => ({
        checkpoints: { ...state.checkpoints, [workspaceId]: checkpoints },
      }));
    } catch (e) {
      console.error(`[checkpointStore] Failed to load checkpoints:`, e);
    }
  },

  revertToCheckpoint: async (workspaceId: string, checkpointId: string) => {
    try {
      await revertToCheckpointCmd(workspaceId, checkpointId);
    } catch (e) {
      console.error(`[checkpointStore] Failed to revert checkpoint:`, e);
      throw e;
    }
  },

  getCheckpoints: (workspaceId: string) => {
    return get().checkpoints[workspaceId] ?? [];
  },

  getRevertedTurnIndex: (workspaceId: string) => {
    return get().revertedTurnIndex[workspaceId] ?? null;
  },
}));
