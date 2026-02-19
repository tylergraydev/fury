import { create } from "zustand";
import {
  type CreateWorkspaceRequest,
  type WorkspaceInfo,
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from "../lib/tauri";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  activeRepoId: string | null;
  loading: boolean;
  error: string | null;

  loadWorkspaces: () => Promise<void>;
  createWs: (request: CreateWorkspaceRequest) => Promise<WorkspaceInfo>;
  archiveWs: (id: string) => Promise<void>;
  deleteWs: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  setActiveRepo: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeRepoId: null,
  loading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ loading: true, error: null });
    try {
      const workspaces = await listWorkspaces();
      set({ workspaces, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createWs: async (request: CreateWorkspaceRequest) => {
    set({ error: null });
    try {
      const ws = await createWorkspace(request);
      set({
        workspaces: [...get().workspaces, ws],
        activeWorkspaceId: ws.id,
      });
      return ws;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  archiveWs: async (id: string) => {
    try {
      await archiveWorkspace(id);
      set({
        workspaces: get().workspaces.filter((w) => w.id !== id),
        activeWorkspaceId:
          get().activeWorkspaceId === id ? null : get().activeWorkspaceId,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteWs: async (id: string) => {
    try {
      await deleteWorkspace(id);
      set({
        workspaces: get().workspaces.filter((w) => w.id !== id),
        activeWorkspaceId:
          get().activeWorkspaceId === id ? null : get().activeWorkspaceId,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActive: (id: string | null) => {
    set({ activeWorkspaceId: id, activeRepoId: null });
  },

  setActiveRepo: (id: string | null) => {
    set({ activeRepoId: id, activeWorkspaceId: null });
  },
}));
