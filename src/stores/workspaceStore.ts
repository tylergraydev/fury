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
  setWorkspacePinned,
  getLastActiveContext,
  saveLastActiveContext,
} from "../lib/tauri";
import { useUIStore } from "./uiStore";
import { useChatStore } from "./chatStore";
import { useAgentStore } from "./agentStore";
import { usePrStore } from "./prStore";
import { cleanupWorkspaceTracking as cleanupActivityTracking } from "../lib/activityLogListeners";
import { cleanupWorkspaceTracking as cleanupNotificationTracking } from "../lib/notificationListeners";

/**
 * Cross-store cleanup when a workspace is archived or deleted.
 * Unsubscribes event listeners from other stores to prevent memory leaks.
 */
function _cleanupWorkspace(workspaceId: string) {
  try { useChatStore.getState().unsubscribe(workspaceId); } catch (e) { console.warn(`[workspaceStore] chat cleanup failed for ${workspaceId}:`, e); }
  try { useAgentStore.getState().unsubscribe(workspaceId); } catch (e) { console.warn(`[workspaceStore] agent cleanup failed for ${workspaceId}:`, e); }
  try { usePrStore.getState().unsubscribe(workspaceId); } catch (e) { console.warn(`[workspaceStore] pr cleanup failed for ${workspaceId}:`, e); }
  cleanupActivityTracking(workspaceId);
  cleanupNotificationTracking(workspaceId);
}

/** Fire-and-forget persist of the active context to the backend DB. */
function _persistActiveContext(workspaceId: string | null, repoId: string | null) {
  saveLastActiveContext(workspaceId, repoId).catch((e) => {
    console.warn("[workspaceStore] failed to persist active context:", e);
  });
}

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
  pinWs: (id: string, pinned: boolean) => Promise<void>;
}

// Stryker disable all: initial state values — reset by tests in beforeEach, mutations unobservable
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  archivedWorkspaces: [],
  activeWorkspaceId: (import.meta.env.DEV ? sessionStorage.getItem("fury:activeWorkspaceId") : null) ?? null,
  activeRepoId: (import.meta.env.DEV ? sessionStorage.getItem("fury:activeRepoId") : null) ?? null,
  loading: false,
  error: null,
// Stryker restore all

  loadWorkspaces: async () => {
    set({ loading: true, error: null });
    try {
      // Fetch workspaces and last active context in parallel
      const [workspaces, [savedWsId, savedRepoId]] = await Promise.all([
        listWorkspaces(),
        // Only restore if nothing is active yet (first load on app start)
        get().activeWorkspaceId || get().activeRepoId
          ? Promise.resolve([null, null] as [string | null, string | null])
          : getLastActiveContext(),
      ]);

      // Restore saved active context if valid
      if (savedWsId && workspaces.some((w) => w.id === savedWsId)) {
        set({ workspaces, loading: false, activeWorkspaceId: savedWsId });
      } else if (savedRepoId) {
        set({ workspaces, loading: false, activeRepoId: savedRepoId });
      } else {
        set({ workspaces, loading: false });
      }
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
        activeRepoId: null,
      });
      _persistActiveContext(ws.id, null);
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
      const wasActive = get().activeWorkspaceId === id;
      useUIStore.getState().closeChatTabsForContext(id);
      const remaining = get().workspaces.filter((w) => w.id !== id);
      const nextActive = wasActive
        ? (remaining[0]?.id ?? null)
        : get().activeWorkspaceId;
      set({
        workspaces: remaining,
        archivedWorkspaces: archived
          ? [...get().archivedWorkspaces, archived]
          : get().archivedWorkspaces,
        activeWorkspaceId: nextActive,
        activeRepoId: wasActive ? null : get().activeRepoId,
      });
      if (wasActive) _persistActiveContext(nextActive, null);

      // Cross-store cleanup for the archived workspace
      _cleanupWorkspace(id);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteWs: async (id: string) => {
    try {
      const wasActive = get().activeWorkspaceId === id;
      await deleteWorkspace(id);
      useUIStore.getState().closeChatTabsForContext(id);
      const remaining = get().workspaces.filter((w) => w.id !== id);
      const nextActive = wasActive
        ? (remaining[0]?.id ?? null)
        : get().activeWorkspaceId;
      set({
        workspaces: remaining,
        activeWorkspaceId: nextActive,
        activeRepoId: wasActive ? null : get().activeRepoId,
      });
      if (wasActive) _persistActiveContext(nextActive, null);

      // Cross-store cleanup for the deleted workspace
      _cleanupWorkspace(id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActive: (id: string | null) => {
    set({ activeWorkspaceId: id, activeRepoId: null });
    _persistActiveContext(id, null);
  },

  setActiveRepo: (id: string | null) => {
    set({ activeRepoId: id, activeWorkspaceId: null });
    _persistActiveContext(null, id);
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
      await restoreWorkspace(id);
      const ws = get().archivedWorkspaces.find((w) => w.id === id);
      set({
        archivedWorkspaces: get().archivedWorkspaces.filter((w) => w.id !== id),
        workspaces: ws ? [...get().workspaces, ws] : get().workspaces,
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

  pinWs: async (id: string, pinned: boolean) => {
    try {
      await setWorkspacePinned(id, pinned);
      set({
        workspaces: get().workspaces.map((w) =>
          w.id === id ? { ...w, pinned } : w,
        ),
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
