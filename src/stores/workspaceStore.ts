import { create } from "zustand";
import {
  type CreateWorkspaceRequest,
  type WorkspaceInfo,
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  listArchivedWorkspaces,
  restoreWorkspace,
  renameWorkspace,
} from "../lib/tauri";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  archivedWorkspaces: WorkspaceInfo[];
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
  loadArchivedWorkspaces: () => Promise<void>;
  restoreWs: (id: string) => Promise<void>;
  renameWs: (id: string, name: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  archivedWorkspaces: [],
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
      const archived = get().workspaces.find((w) => w.id === id);
      set({
        workspaces: get().workspaces.filter((w) => w.id !== id),
        archivedWorkspaces: archived
          ? [...get().archivedWorkspaces, archived]
          : get().archivedWorkspaces,
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

  loadArchivedWorkspaces: async () => {
    try {
      const archived = await listArchivedWorkspaces();
      set({ archivedWorkspaces: archived });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  restoreWs: async (id: string) => {
    try {
      const ws = await restoreWorkspace(id);
      set({
        workspaces: [...get().workspaces, ws],
        archivedWorkspaces: get().archivedWorkspaces.filter(
          (w) => w.id !== id,
        ),
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  renameWs: async (id: string, name: string) => {
    try {
      await renameWorkspace(id, name);
      set({
        workspaces: get().workspaces.map((w) =>
          w.id === id ? { ...w, name } : w,
        ),
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
