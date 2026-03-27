import { useEffect } from "react";
import { useWorkItemStore } from "../../stores/workItemStore";
import { WorkItemBadge } from "./WorkItemBadge";

interface Props {
  workspaceId: string;
  workItemId: number;
}

export function WorkItemDetail({ workspaceId, workItemId }: Props) {
  const detail = useWorkItemStore((s) => s.workItemDetail[String(workItemId)] ?? null);

  useEffect(() => {
    useWorkItemStore.getState().loadWorkItemDetail(workspaceId, workItemId);
  }, [workspaceId, workItemId]);

  if (!detail) {
    return (
      <div
        className="px-3 py-2 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      className="space-y-2 px-3 py-2"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <WorkItemBadge type={detail.workItemType} />
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          #{detail.id}
        </span>
        {detail.priority != null && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            P{detail.priority}
          </span>
        )}
      </div>

      {/* Meta fields */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {detail.assignedTo && (
          <>
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              Assigned to
            </span>
            <span className="truncate text-[9px]" style={{ color: "var(--text-secondary)" }}>
              {detail.assignedTo}
            </span>
          </>
        )}
        {detail.areaPath && (
          <>
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              Area
            </span>
            <span className="truncate text-[9px]" style={{ color: "var(--text-secondary)" }}>
              {detail.areaPath}
            </span>
          </>
        )}
        {detail.iterationPath && (
          <>
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              Iteration
            </span>
            <span className="truncate text-[9px]" style={{ color: "var(--text-secondary)" }}>
              {detail.iterationPath}
            </span>
          </>
        )}
      </div>

      {/* Description */}
      {detail.description && (
        <div>
          <div className="mb-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
            Description
          </div>
          <div
            className="max-h-24 overflow-auto rounded p-1.5 text-[10px] leading-relaxed"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-secondary)",
            }}
            dangerouslySetInnerHTML={{ __html: detail.description }}
          />
        </div>
      )}

      {/* Acceptance Criteria */}
      {detail.acceptanceCriteria && (
        <div>
          <div className="mb-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
            Acceptance Criteria
          </div>
          <div
            className="max-h-20 overflow-auto rounded p-1.5 text-[10px] leading-relaxed"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-secondary)",
            }}
            dangerouslySetInnerHTML={{ __html: detail.acceptanceCriteria }}
          />
        </div>
      )}

      {/* Linked PRs */}
      {detail.linkedPrIds.length > 0 && (
        <div>
          <div className="mb-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
            Linked PRs
          </div>
          <div className="flex flex-wrap gap-1">
            {detail.linkedPrIds.map((prId) => (
              <span
                key={prId}
                className="rounded px-1 py-0.5 text-[9px]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  color: "var(--accent)",
                }}
              >
                #{prId}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Relations */}
      {detail.relations.length > 0 && (
        <div>
          <div className="mb-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
            Relations ({detail.relations.length})
          </div>
          <div
            className="space-y-0.5 rounded p-1"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {detail.relations.map((rel, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px]">
                <span
                  className="rounded px-1 py-0.5"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  {rel.relType}
                </span>
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                  {rel.targetTitle ?? `#${rel.targetId}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
