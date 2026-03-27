import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  WorkItemListItem,
  WorkItemDetail,
  WorkItemQueryType,
  CreateWorkItemRequest,
} from "./types";

export async function listWorkItems(
  workspaceId: string,
  queryType: WorkItemQueryType,
): Promise<WorkItemListItem[]> {
  return invoke<WorkItemListItem[]>("list_work_items", {
    workspaceId,
    queryType,
  });
}

export async function getWorkItemDetail(
  workspaceId: string,
  workItemId: number,
): Promise<WorkItemDetail> {
  return invoke<WorkItemDetail>("get_work_item_detail", {
    workspaceId,
    workItemId,
  });
}

export async function createWorkItem(
  request: CreateWorkItemRequest,
): Promise<WorkItemListItem> {
  return invoke<WorkItemListItem>("create_work_item", { request });
}

export async function updateWorkItemState(
  workspaceId: string,
  workItemId: number,
  newState: string,
): Promise<WorkItemListItem> {
  return invoke<WorkItemListItem>("update_work_item_state", {
    workspaceId,
    workItemId,
    newState,
  });
}

export async function linkWorkItemToPr(
  workspaceId: string,
  workItemId: number,
  prId: number,
): Promise<void> {
  return invoke("link_work_item_to_pr", { workspaceId, workItemId, prId });
}
