import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, X } from "lucide-react";
import { usePrStore } from "../../stores/prStore";
import { stripAnsi } from "../../lib/testRunnerUtils";
import type {
  WorkflowRun,
  WorkflowJob,
  RunLogsResult,
} from "../../lib/tauri";
import {
  getRunJobs,
  getRunLogs,
  rerunWorkflow,
} from "../../lib/tauri";

function runStatusColor(run: WorkflowRun): string {
  if (run.conclusion === "success") return "var(--success)";
  if (run.conclusion === "failure") return "var(--error)";
  if (run.status === "in_progress" || run.status === "queued") return "var(--text-muted)";
  return "var(--text-muted)";
}

export function runIsInProgress(run: WorkflowRun): boolean {
  return run.status === "in_progress" || run.status === "queued";
}

function jobStatusColor(job: WorkflowJob): string {
  if (job.conclusion === "success") return "var(--success)";
  if (job.conclusion === "failure") return "var(--error)";
  if (job.conclusion === "skipped") return "var(--text-muted)";
  return "var(--text-muted)";
}

export function WorkflowRunRow({
  run,
  workspaceId,
  expanded,
  onToggle,
}: {
  run: WorkflowRun;
  workspaceId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [logsResult, setLogsResult] = useState<RunLogsResult | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const color = runStatusColor(run);
  const inProgress = runIsInProgress(run);

  useEffect(() => {
    if (expanded && jobs.length === 0 && !jobsLoading) {
      setJobsLoading(true);
      getRunJobs(workspaceId, run.id)
        .then(setJobs)
        .catch((e) => console.error("[WorkflowRunRow] Failed to load jobs:", e))
        .finally(() => setJobsLoading(false));
    }
  }, [expanded, workspaceId, run.id, jobs.length, jobsLoading]);

  const handleViewLogs = async (failedOnly: boolean) => {
    setLogsLoading(true);
    setShowLogs(true);
    try {
      const result = await getRunLogs(workspaceId, run.id, failedOnly);
      setLogsResult(result);
    } catch (e) {
      setLogsResult({ logs: `Failed to load logs: ${String(e)}`, truncated: false });
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRerun = async (failedOnly: boolean) => {
    setRerunning(true);
    try {
      await rerunWorkflow(workspaceId, run.id, failedOnly);
      usePrStore.getState().loadWorkflowRuns(workspaceId);
      usePrStore.getState().startPolling(workspaceId);
    } catch (e) {
      console.error("[WorkflowRunRow] Failed to rerun:", e);
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-surface)]"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        )}
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${inProgress ? "animate-pulse" : ""}`}
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-left" style={{ color: "var(--text-primary)" }}>
          {run.workflowName}
        </span>
        <span
          className="ml-auto flex-shrink-0"
          style={{ color }}
        >
          {run.conclusion?.toLowerCase() ?? run.status}
        </span>
      </button>

      {expanded && (
        <div className="ml-4 border-l" style={{ borderColor: "var(--border)" }}>
          {jobsLoading ? (
            <div className="px-3 py-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Loading jobs...
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="px-2 py-0.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: jobStatusColor(job) }}
                  />
                  <span className="truncate" style={{ color: "var(--text-primary)" }}>
                    {job.name}
                  </span>
                  <span className="ml-auto flex-shrink-0" style={{ color: jobStatusColor(job) }}>
                    {job.conclusion?.toLowerCase() ?? job.status}
                  </span>
                </div>
                {job.steps.length > 0 && (
                  <div className="ml-3 mt-0.5">
                    {job.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                        <span
                          className="h-1 w-1 flex-shrink-0 rounded-full"
                          style={{
                            /* v8 ignore next 4 -- ternary branches for step conclusion styling */
                            backgroundColor:
                              step.conclusion === "success"
                                ? "var(--success)"
                                : step.conclusion === "failure"
                                  ? "var(--error)"
                                  : "var(--text-muted)",
                          }}
                        />
                        <span className="truncate">{step.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-1 px-2 py-1">
            <button
              onClick={() => handleViewLogs(false)}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-secondary)",
              }}
            >
              View Logs
            </button>
            {run.conclusion === "failure" && (
              <button
                onClick={() => handleViewLogs(true)}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                Failed Logs
              </button>
            )}
            <button
              onClick={() => handleRerun(false)}
              disabled={rerunning}
              className="rounded px-1.5 py-0.5 text-[10px] disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-secondary)",
              }}
            >
              {rerunning ? "Re-running..." : "Re-run"}
            </button>
            {run.conclusion === "failure" && (
              <button
                onClick={() => handleRerun(true)}
                disabled={rerunning}
                className="rounded px-1.5 py-0.5 text-[10px] disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                Re-run Failed
              </button>
            )}
          </div>

          {/* Log viewer */}
          {showLogs && (
            <div className="mx-2 mb-1 rounded" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Logs
                </span>
                <button onClick={() => setShowLogs(false)}>
                  <X className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
              {logsLoading ? (
                <div className="px-2 py-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Loading logs...
                </div>
              ) : (
                <>
                  <pre
                    className="max-h-64 overflow-auto px-2 py-1 text-[10px] leading-relaxed"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {/* v8 ignore next */ logsResult ? stripAnsi(logsResult.logs) : ""}
                  </pre>
                  {logsResult?.truncated && (
                    <div className="px-2 py-1 text-[10px]" style={{ color: "var(--warning)" }}>
                      Truncated — view full logs on GitHub
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
