import { useEffect, useState } from "react";
import { Plus, ChevronRight, ChevronDown } from "lucide-react";
import { useWorkItemStore } from "../../stores/workItemStore";
import { usePrStore } from "../../stores/prStore";
import type { WorkItemQueryType } from "../../lib/tauri";
import { WorkItemBadge } from "./WorkItemBadge";
import { WorkItemDetail } from "./WorkItemDetail";
import { CreateWorkItemForm } from "./CreateWorkItemForm";

interface Props {
  workspaceId: string;
}

const EMPTY_WORK_ITEMS: import("../../lib/tauri").WorkItemListItem[] = [];

const QUERY_TABS: { label: string; value: WorkItemQueryType }[] = [
  { label: "Assigned to Me", value: "assigned_to_me" },
  { label: "Linked to PR", value: "linked_to_pr" },
  { label: "This Iteration", value: "recent_in_iteration" },
];

const WORK_ITEM_STATES = [
  "New",
  "Active",
  "In Progress",
  "Resolved",
  "Closed",
  "Done",
];

export function WorkItemsPanel({ workspaceId }: Props) {
  const workItems = useWorkItemStore((s) => s.workItems[workspaceId] ?? EMPTY_WORK_ITEMS);
  const loading = useWorkItemStore((s) => s.loading[workspaceId] ?? false);
  const error = useWorkItemStore((s) => s.error[workspaceId] ?? null);
  const activeQuery = useWorkItemStore(
    (s) => s.activeQuery[workspaceId] ?? "assigned_to_me",
  );
  const prNumber = usePrStore((s) => s.prInfo[workspaceId]?.prNumber ?? null);

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingState, setUpdatingState] = useState<number | null>(null);
  const [linkingPr, setLinkingPr] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      useWorkItemStore
        .getState()
        .loadWorkItems(workspaceId, activeQuery);
    });
    return () => cancelAnimationFrame(id);
  }, [workspaceId, activeQuery]);

  const handleQueryChange = (query: WorkItemQueryType) => {
    useWorkItemStore.getState().loadWorkItems(workspaceId, query);
  };

  const handleStateChange = async (workItemId: number, newState: string) => {
    setUpdatingState(workItemId);
    try {
      await useWorkItemStore
        .getState()
        .updateWorkItemState(workspaceId, workItemId, newState);
    } catch (e) {
      console.error("[WorkItemsPanel] Failed to update state:", e);
    } finally {
      setUpdatingState(null);
    }
  };

  const handleLinkPr = async (workItemId: number) => {
    if (!prNumber) return;
    setLinkingPr(workItemId);
    try {
      await useWorkItemStore
        .getState()
        .linkWorkItemToPr(workspaceId, workItemId, prNumber);
    } catch (e) {
      console.error("[WorkItemsPanel] Failed to link PR:", e);
    } finally {
      setLinkingPr(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          Work Items{workItems.length > 0 ? ` (${workItems.length})` : ""}
        </span>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded p-0.5 transition-colors hover:bg-[var(--bg-surface)]"
          title="New work item"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateWorkItemForm
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Query tabs */}
      <div
        className="flex flex-shrink-0 gap-0.5 px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {QUERY_TABS.map((tab) => {
          const active = activeQuery === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => handleQueryChange(tab.value)}
              className="rounded px-1.5 py-0.5 text-[9px] transition-colors"
              style={{
                backgroundColor: active ? "var(--bg-surface)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div
            className="mx-3 my-2 rounded p-2 text-[10px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        {loading && workItems.length === 0 && (
          <div
            className="px-3 py-4 text-center text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            Loading...
          </div>
        )}

        {!loading && !error && workItems.length === 0 && (
          <div
            className="px-3 py-4 text-center text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            No work items found
          </div>
        )}

        {workItems.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {/* Item row */}
              <div className="flex items-start gap-2 px-2 py-1.5">
                {/* Expand toggle */}
                <button
                  onClick={() =>
                    setExpandedId(expanded ? null : item.id)
                  }
                  className="mt-0.5 flex-shrink-0"
                >
                  {expanded ? (
                    <ChevronDown
                      className="h-3 w-3"
                      style={{ color: "var(--text-muted)" }}
                    />
                  ) : (
                    <ChevronRight
                      className="h-3 w-3"
                      style={{ color: "var(--text-muted)" }}
                    />
                  )}
                </button>

                {/* Badge + title */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <WorkItemBadge type={item.workItemType} />
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      #{item.id}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 truncate text-[10px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </div>
                </div>

                {/* State dropdown */}
                <select
                  value={item.state}
                  disabled={updatingState === item.id}
                  onChange={(e) =>
                    handleStateChange(item.id, e.target.value).catch((err) =>
                      console.error("[WorkItemsPanel] state change error:", err),
                    )
                  }
                  className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] outline-none disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {WORK_ITEM_STATES.includes(item.state)
                    ? WORK_ITEM_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))
                    : [
                        <option key={item.state} value={item.state}>
                          {item.state}
                        </option>,
                        ...WORK_ITEM_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        )),
                      ]}
                </select>

                {/* Link PR button */}
                {prNumber != null && (
                  <button
                    onClick={() =>
                      handleLinkPr(item.id).catch((err) =>
                        console.error("[WorkItemsPanel] link PR error:", err),
                      )
                    }
                    disabled={linkingPr === item.id}
                    className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] disabled:opacity-50"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: "var(--accent)",
                      border:
                        "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    }}
                    title={`Link to PR #${prNumber}`}
                  >
                    {linkingPr === item.id ? "..." : "Link PR"}
                  </button>
                )}
              </div>

              {/* Expanded detail */}
              {expanded && (
                <WorkItemDetail
                  workspaceId={workspaceId}
                  workItemId={item.id}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
