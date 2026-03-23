import { create } from "zustand";
import {
  ContainerState,
  ContainerStatus,
  DevContainerConfig,
  getContainerStatus,
  startContainer,
  stopContainer,
  rebuildContainer,
  updateDevcontainerConfig,
  containerizeRepo,
  applyDevcontainerConfig,
} from "../lib/tauri";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "An unexpected error occurred";
}

interface DevContainerStore {
  containerStates: Record<string, ContainerState>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  containerizing: Record<string, boolean>;
  proposedConfig: Record<string, string>;
  containerizeError: Record<string, string | null>;

  fetchStatus: (workspaceId: string) => Promise<void>;
  start: (workspaceId: string) => Promise<void>;
  stop: (workspaceId: string) => Promise<void>;
  rebuild: (workspaceId: string) => Promise<void>;
  updateConfig: (
    workspaceId: string,
    config: DevContainerConfig,
  ) => Promise<void>;
  handleStatusEvent: (
    workspaceId: string,
    status: ContainerStatus,
    containerId: string | null,
  ) => void;
  containerize: (workspaceId: string) => Promise<void>;
  applyConfig: (
    workspaceId: string,
    configJson: string,
    commitToRepo: boolean,
    devcontainerPath?: string,
  ) => Promise<void>;
  clearProposedConfig: (workspaceId: string) => void;
}

export const useDevContainerStore = create<DevContainerStore>((set) => ({
  containerStates: {},
  loading: {},
  error: {},
  containerizing: {},
  proposedConfig: {},
  containerizeError: {},

  fetchStatus: async (workspaceId: string) => {
    try {
      const state = await getContainerStatus(workspaceId);
      set((s) => ({
        containerStates: { ...s.containerStates, [workspaceId]: state },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: errorMessage(e) },
      }));
    }
  },

  start: async (workspaceId: string) => {
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
    }));
    try {
      const state = await startContainer(workspaceId);
      set((s) => ({
        containerStates: { ...s.containerStates, [workspaceId]: state },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: errorMessage(e) },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    }
  },

  stop: async (workspaceId: string) => {
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
    }));
    try {
      await stopContainer(workspaceId);
      set((s) => {
        const current = s.containerStates[workspaceId];
        return {
          containerStates: {
            ...s.containerStates,
            [workspaceId]: current
              ? { ...current, status: "stopped" as ContainerStatus }
              : {
                  workspaceId,
                  status: "stopped" as ContainerStatus,
                  containerId: null,
                  containerName: null,
                  logTail: [],
                },
          },
          loading: { ...s.loading, [workspaceId]: false },
        };
      });
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: errorMessage(e) },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    }
  },

  rebuild: async (workspaceId: string) => {
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
    }));
    try {
      const state = await rebuildContainer(workspaceId);
      set((s) => ({
        containerStates: { ...s.containerStates, [workspaceId]: state },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: errorMessage(e) },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    }
  },

  updateConfig: async (workspaceId: string, config: DevContainerConfig) => {
    try {
      await updateDevcontainerConfig(workspaceId, config);
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: errorMessage(e) },
      }));
      throw e;
    }
  },

  handleStatusEvent: (
    workspaceId: string,
    status: ContainerStatus,
    containerId: string | null,
  ) => {
    set((s) => {
      const current = s.containerStates[workspaceId];
      return {
        containerStates: {
          ...s.containerStates,
          [workspaceId]: {
            workspaceId,
            status,
            /* v8 ignore next -- defensive fallback chain for container ID */
            containerId: containerId ?? current?.containerId ?? null,
            containerName: current?.containerName ?? null,
            logTail: current?.logTail ?? [],
          },
        },
      };
    });
  },

  containerize: async (workspaceId: string) => {
    set((s) => ({
      containerizing: { ...s.containerizing, [workspaceId]: true },
      containerizeError: { ...s.containerizeError, [workspaceId]: null },
    }));
    try {
      const json = await containerizeRepo(workspaceId);
      set((s) => ({
        proposedConfig: { ...s.proposedConfig, [workspaceId]: json },
        containerizing: { ...s.containerizing, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        containerizing: { ...s.containerizing, [workspaceId]: false },
        containerizeError: {
          ...s.containerizeError,
          [workspaceId]: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  },

  applyConfig: async (
    workspaceId: string,
    configJson: string,
    commitToRepo: boolean,
    devcontainerPath?: string,
  ) => {
    await applyDevcontainerConfig(
      workspaceId,
      configJson,
      commitToRepo,
      devcontainerPath,
    );
    set((s) => {
      const { [workspaceId]: _, ...rest } = s.proposedConfig;
      return { proposedConfig: rest };
    });
  },

  clearProposedConfig: (workspaceId: string) => {
    set((s) => {
      const { [workspaceId]: _, ...rest } = s.proposedConfig;
      return { proposedConfig: rest };
    });
  },
}));
