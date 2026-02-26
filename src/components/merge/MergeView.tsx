import { useEffect } from "react";
import { GitMerge, RefreshCw, GitCompare, AlertCircle, Archive } from "lucide-react";
import { useMergeStore, type MergeSection } from "../../stores/mergeStore";
import { useStashStore } from "../../stores/stashStore";
import { BranchSyncSection } from "./BranchSyncSection";
import { WorktreeCompareSection } from "./WorktreeCompareSection";
import { ConflictSection } from "./ConflictSection";
import { StashSection } from "./StashSection";

interface Props {
  workspaceId: string;
}

const SECTIONS: { id: MergeSection; label: string }[] = [
  { id: "sync", label: "Sync" },
  { id: "compare", label: "Compare" },
  { id: "conflicts", label: "Conflicts" },
  { id: "stash", label: "Stash" },
];

export function MergeView({ workspaceId }: Props) {
  const activeSection = useMergeStore(
    (s) => s.activeSection[workspaceId] ?? "sync",
  );
  const conflictCount = useMergeStore(
    (s) => (s.conflictedFiles[workspaceId] ?? []).length,
  );
  const stashCount = useStashStore(
    (s) => (s.stashes[workspaceId] ?? []).length,
  );

  // Load conflicts on mount to detect pre-existing state
  useEffect(() => {
    useMergeStore.getState().loadConflictedFiles(workspaceId);
    useStashStore.getState().loadStashes(workspaceId);
  }, [workspaceId]);

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Sub-tab bar */}
      <div
        className="flex items-center gap-1 px-3 py-1.5"
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() =>
                useMergeStore
                  .getState()
                  .setActiveSection(workspaceId, section.id)
              }
              className="relative flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--bg-surface)"
                  : "transparent",
                color: isActive
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              }}
            >
              {section.id === "sync" && <RefreshCw className="h-3 w-3" />}
              {section.id === "compare" && (
                <GitCompare className="h-3 w-3" />
              )}
              {section.id === "conflicts" && (
                <AlertCircle className="h-3 w-3" />
              )}
              {section.id === "stash" && <Archive className="h-3 w-3" />}
              {section.label}
              {section.id === "conflicts" && conflictCount > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--error)",
                    color: "var(--bg-primary)",
                  }}
                >
                  {conflictCount}
                </span>
              )}
              {section.id === "stash" && stashCount > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--accent-purple)",
                    color: "var(--bg-primary)",
                  }}
                >
                  {stashCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeSection === "sync" && (
          <BranchSyncSection workspaceId={workspaceId} />
        )}
        {activeSection === "compare" && (
          <WorktreeCompareSection workspaceId={workspaceId} />
        )}
        {activeSection === "conflicts" && (
          <ConflictSection workspaceId={workspaceId} />
        )}
        {activeSection === "stash" && (
          <StashSection workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}

export function MergeViewWrapper() {
  // This wrapper handles the "no workspace" case
  return (
    <div
      className="flex h-full flex-col items-center justify-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <GitMerge
        className="mb-4 h-12 w-12"
        style={{ color: "var(--text-muted)" }}
      />
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Select a workspace to use merge tools
      </p>
    </div>
  );
}
