import { create } from "zustand";
import type {
  WorkItemListItem,
  WorkItemDetail,
  WorkItemQueryType,
  CreateWorkItemRequest,
} from "../lib/tauri";
import {
  listWorkItems as listWorkItemsCmd,
  getWorkItemDetail as getWorkItemDetailCmd,
  createWorkItem as createWorkItemCmd,
  updateWorkItemState as updateWorkItemStateCmd,
  linkWorkItemToPr as linkWorkItemToPrCmd,
} from "../lib/tauri";

const _inflightWorkItems = new Set<string>();
const _inflightDetails = new Set<string>();

interface WorkItemStore {
  workItems: Record<string, WorkItemListItem[]>;
  workItemDetail: Record<string, WorkItemDetail>;
  activeQuery: Record<string, WorkItemQueryType>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadWorkItems: (workspaceId: string, queryType: WorkItemQueryType) => Promise<void>;
  loadWorkItemDetail: (workspaceId: string, workItemId: number) => Promise<void>;
  createWorkItem: (request: CreateWorkItemRequest) => Promise<WorkItemListItem>;
  updateWorkItemState: (workspaceId: string, workItemId: number, newState: string) => Promise<void>;
  linkWorkItemToPr: (workspaceId: string, workItemId: number, prId: number) => Promise<void>;

  getWorkItems: (workspaceId: string) => WorkItemListItem[];
  getWorkItemDetail: (workItemId: number) => WorkItemDetail | null;
  isLoading: (workspaceId: string) => boolean;
  getError: (workspaceId: string) => string | null;
}

export const useWorkItemStore = create<WorkItemStore>((set, get) => ({
  workItems: {},
  workItemDetail: {},
  activeQuery: {},
  loading: {},
  error: {},

  loadWorkItems: async (workspaceId, queryType) => {
    const key = `${workspaceId}:${queryType}`;
    if (_inflightWorkItems.has(key)) return;
    _inflightWorkItems.add(key);
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
      activeQuery: { ...s.activeQuery, [workspaceId]: queryType },
    }));
    try {
      const items = await listWorkItemsCmd(workspaceId, queryType);
      set((s) => ({
        workItems: { ...s.workItems, [workspaceId]: items },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: String(e) },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } finally {
      _inflightWorkItems.delete(key);
    }
  },

  loadWorkItemDetail: async (workspaceId, workItemId) => {
    const key = `${workspaceId}:${workItemId}`;
    if (_inflightDetails.has(key)) return;
    _inflightDetails.add(key);
    try {
      const detail = await getWorkItemDetailCmd(workspaceId, workItemId);
      set((s) => ({
        workItemDetail: { ...s.workItemDetail, [String(workItemId)]: detail },
      }));
    } catch {
      // Detail load failure is non-critical
    } finally {
      _inflightDetails.delete(key);
    }
  },

  createWorkItem: async (request) => {
    const item = await createWorkItemCmd(request);
    const wsId = request.workspaceId;
    const queryType = get().activeQuery[wsId] ?? "assigned_to_me";
    set((s) => ({
      workItems: { ...s.workItems, [wsId]: [item, ...(s.workItems[wsId] ?? [])] },
    }));
    get().loadWorkItems(wsId, queryType);
    return item;
  },

  updateWorkItemState: async (workspaceId, workItemId, newState) => {
    const updated = await updateWorkItemStateCmd(workspaceId, workItemId, newState);
    set((s) => ({
      workItems: {
        ...s.workItems,
        [workspaceId]: (s.workItems[workspaceId] ?? []).map((wi) =>
          wi.id === workItemId ? updated : wi,
        ),
      },
    }));
  },

  linkWorkItemToPr: async (workspaceId, workItemId, prId) => {
    await linkWorkItemToPrCmd(workspaceId, workItemId, prId);
    get().loadWorkItemDetail(workspaceId, workItemId);
  },

  getWorkItems: (workspaceId) => get().workItems[workspaceId] ?? [],
  getWorkItemDetail: (workItemId) => get().workItemDetail[String(workItemId)] ?? null,
  isLoading: (workspaceId) => get().loading[workspaceId] ?? false,
  getError: (workspaceId) => get().error[workspaceId] ?? null,
}));
