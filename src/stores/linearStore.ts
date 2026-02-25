import { create } from "zustand";
import {
  type LinearIssue,
  type WorkspaceIssue,
  type LinkIssueRequest,
  searchLinearIssues as searchLinearIssuesCmd,
  linkIssueToWorkspace as linkIssueCmd,
  unlinkIssueFromWorkspace as unlinkIssueCmd,
  getWorkspaceIssues as getWorkspaceIssuesCmd,
} from "../lib/tauri";

interface LinearStore {
  searchResults: LinearIssue[];
  searchLoading: boolean;
  searchError: string | null;

  linkedIssues: Record<string, WorkspaceIssue[]>;
  loading: Record<string, boolean>;

  searchIssues: (query: string) => Promise<void>;
  clearSearch: () => void;
  loadLinkedIssues: (workspaceId: string) => Promise<void>;
  linkIssue: (request: LinkIssueRequest) => Promise<void>;
  unlinkIssue: (workspaceId: string, issueId: string) => Promise<void>;
}

// Module-level inflight tracker — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightLinkedIssues = new Set<string>();

export const useLinearStore = create<LinearStore>((set, get) => ({
  searchResults: [],
  searchLoading: false,
  searchError: null,
  linkedIssues: {},
  loading: {},

  searchIssues: async (query: string) => {
    set({ searchLoading: true, searchError: null });
    try {
      const results = await searchLinearIssuesCmd(query);
      set({ searchResults: results, searchLoading: false });
    } catch (e) {
      set({ searchError: String(e), searchLoading: false });
    }
  },

  clearSearch: () => {
    set({ searchResults: [], searchError: null });
  },

  loadLinkedIssues: async (workspaceId: string) => {
    if (_inflightLinkedIssues.has(workspaceId)) return;
    _inflightLinkedIssues.add(workspaceId);
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
    }));
    try {
      const issues = await getWorkspaceIssuesCmd(workspaceId);
      set((state) => ({
        linkedIssues: { ...state.linkedIssues, [workspaceId]: issues },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      console.error("Failed to load linked issues:", e);
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } finally {
      _inflightLinkedIssues.delete(workspaceId);
    }
  },

  linkIssue: async (request: LinkIssueRequest) => {
    await linkIssueCmd(request);
    try {
      await get().loadLinkedIssues(request.workspaceId);
    } catch (e) {
      console.error("Issue linked but failed to refresh list:", e);
    }
  },

  unlinkIssue: async (workspaceId: string, issueId: string) => {
    await unlinkIssueCmd({ workspaceId, issueId });
    try {
      await get().loadLinkedIssues(workspaceId);
    } catch (e) {
      console.error("Issue unlinked but failed to refresh list:", e);
    }
  },
}));
