import { useEffect } from "react";
import {
  GitBranch,
  ArrowDown,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useMergeStore } from "../../stores/mergeStore";

interface Props {
  workspaceId: string;
}

export function BranchSyncSection({ workspaceId }: Props) {
  const branchStatus = useMergeStore(
    (s) => s.branchStatus[workspaceId] ?? null,
  );
  const loading = useMergeStore((s) => s.loading[workspaceId] ?? false);
  const error = useMergeStore((s) => s.error[workspaceId] ?? null);

  useEffect(() => {
    useMergeStore.getState().loadBranchStatus(workspaceId);
  }, [workspaceId]);

  const handleFetch = () => useMergeStore.getState().fetchUpstream(workspaceId);

  const handlePullRebase = async () => {
    try {
      await useMergeStore.getState().pullRebase(workspaceId);
    } catch {
      // error handled in store
    }
  };

  const handlePullMerge = async () => {
    try {
      await useMergeStore.getState().pullMerge(workspaceId);
    } catch {
      // error handled in store
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 rounded p-2 text-xs"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--error) 15%, transparent)",
              color: "var(--error)",
            }}
          >
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Branch Info */}
        {branchStatus ? (
          <>
            <div
              className="rounded border p-3"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex items-center gap-2 text-xs">
                <GitBranch
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--accent)" }}
                />
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {branchStatus.branch}
                </span>
                <span style={{ color: "var(--text-muted)" }}>vs</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {branchStatus.defaultBranch}
                </span>
              </div>

              {/* Ahead/Behind */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--text-muted)" }}>
                    Status
                  </span>
                  <div className="flex items-center gap-3">
                    {branchStatus.ahead > 0 && (
                      <span style={{ color: "var(--success)" }}>
                        {branchStatus.ahead} ahead
                      </span>
                    )}
                    {branchStatus.behind > 0 && (
                      <span style={{ color: "var(--warning)" }}>
                        {branchStatus.behind} behind
                      </span>
                    )}
                    {branchStatus.ahead === 0 && branchStatus.behind === 0 && (
                      <span style={{ color: "var(--success)" }}>
                        Up to date
                      </span>
                    )}
                  </div>
                </div>

                {/* Visual bar */}
                {(branchStatus.ahead > 0 || branchStatus.behind > 0) && (
                  <div className="flex gap-1">
                    {branchStatus.behind > 0 && (
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          backgroundColor: "var(--warning)",
                          width: `${Math.min(
                            (branchStatus.behind /
                              (branchStatus.ahead + branchStatus.behind)) *
                              100,
                            100,
                          )}%`,
                          minWidth: "8px",
                        }}
                      />
                    )}
                    {branchStatus.ahead > 0 && (
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          backgroundColor: "var(--success)",
                          width: `${Math.min(
                            (branchStatus.ahead /
                              (branchStatus.ahead + branchStatus.behind)) *
                              100,
                            100,
                          )}%`,
                          minWidth: "8px",
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Upstream status */}
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--text-muted)" }}>
                    Remote
                  </span>
                  <span
                    style={{
                      color: branchStatus.hasUpstream
                        ? "var(--success)"
                        : "var(--text-muted)",
                    }}
                  >
                    {branchStatus.hasUpstream
                      ? "Tracking upstream"
                      : "No upstream"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleFetch}
                disabled={loading}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <RefreshCw className="h-3 w-3" />
                {loading ? "Fetching..." : "Fetch"}
              </button>

              {branchStatus.behind > 0 && (
                <>
                  <button
                    onClick={handlePullRebase}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--bg-primary)",
                    }}
                  >
                    <ArrowDown className="h-3 w-3" />
                    {loading ? "Pulling..." : "Pull (Rebase)"}
                  </button>
                  <button
                    onClick={handlePullMerge}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <ArrowDown className="h-3 w-3" />
                    {loading ? "Pulling..." : "Pull (Merge)"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {loading ? "Loading branch status..." : "No branch information"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
