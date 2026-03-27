import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useWorkItemStore } from "./workItemStore";
import type { WorkItemListItem, WorkItemDetail } from "../lib/tauri";

const mockedInvoke = vi.mocked(invoke);

const MOCK_WORK_ITEM: WorkItemListItem = {
  id: 42,
  title: "Fix login bug",
  workItemType: "Bug",
  state: "Active",
  assignedTo: "Dev User",
  areaPath: "Project\\Team",
  iterationPath: "Project\\Sprint 5",
  parentId: 10,
  tags: ["urgent"],
};

const MOCK_DETAIL: WorkItemDetail = {
  ...MOCK_WORK_ITEM,
  description: "<p>Login fails</p>",
  acceptanceCriteria: "<p>Login works</p>",
  priority: 1,
  createdBy: "Admin",
  createdDate: "2026-01-01T00:00:00Z",
  changedDate: "2026-01-02T00:00:00Z",
  linkedPrIds: [99],
  relations: [{ relType: "Parent", targetId: 10, targetTitle: "Parent Story" }],
};

describe("workItemStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkItemStore.setState({
      workItems: {},
      workItemDetail: {},
      activeQuery: {},
      loading: {},
      error: {},
    });
  });

  it("loads work items for a workspace", async () => {
    mockedInvoke.mockResolvedValueOnce([MOCK_WORK_ITEM]);
    await useWorkItemStore.getState().loadWorkItems("ws-1", "assigned_to_me");
    const items = useWorkItemStore.getState().getWorkItems("ws-1");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Fix login bug");
    expect(useWorkItemStore.getState().activeQuery["ws-1"]).toBe("assigned_to_me");
  });

  it("loads work item detail", async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_DETAIL);
    await useWorkItemStore.getState().loadWorkItemDetail("ws-1", 42);
    const detail = useWorkItemStore.getState().getWorkItemDetail(42);
    expect(detail).not.toBeNull();
    expect(detail!.description).toBe("<p>Login fails</p>");
    expect(detail!.linkedPrIds).toEqual([99]);
  });

  it("creates a work item and prepends to list", async () => {
    mockedInvoke
      .mockResolvedValueOnce(MOCK_WORK_ITEM)
      .mockResolvedValueOnce([MOCK_WORK_ITEM]);
    useWorkItemStore.setState({
      workItems: { "ws-1": [] },
      activeQuery: { "ws-1": "assigned_to_me" },
    });
    const result = await useWorkItemStore.getState().createWorkItem({
      workspaceId: "ws-1",
      workItemType: "Bug",
      title: "Fix login bug",
      tags: [],
    });
    expect(result.id).toBe(42);
    expect(useWorkItemStore.getState().getWorkItems("ws-1")).toHaveLength(1);
  });

  it("updates work item state in list", async () => {
    const updated = { ...MOCK_WORK_ITEM, state: "Resolved" };
    mockedInvoke.mockResolvedValueOnce(updated);
    useWorkItemStore.setState({ workItems: { "ws-1": [MOCK_WORK_ITEM] } });
    await useWorkItemStore.getState().updateWorkItemState("ws-1", 42, "Resolved");
    const items = useWorkItemStore.getState().getWorkItems("ws-1");
    expect(items[0].state).toBe("Resolved");
  });

  it("handles load error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("PAT not configured"));
    await useWorkItemStore.getState().loadWorkItems("ws-1", "assigned_to_me");
    expect(useWorkItemStore.getState().getError("ws-1")).toContain("PAT not configured");
    expect(useWorkItemStore.getState().isLoading("ws-1")).toBe(false);
  });

  it("returns defaults for unknown workspace", () => {
    expect(useWorkItemStore.getState().getWorkItems("unknown")).toEqual([]);
    expect(useWorkItemStore.getState().getWorkItemDetail(999)).toBeNull();
    expect(useWorkItemStore.getState().isLoading("unknown")).toBe(false);
    expect(useWorkItemStore.getState().getError("unknown")).toBeNull();
  });
});
