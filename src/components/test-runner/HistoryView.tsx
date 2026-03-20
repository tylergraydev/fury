import { Clock } from "lucide-react";
import type { TestRunRecord } from "../../lib/tauri";
import { formatDuration } from "../../lib/testRunnerUtils";

export function HistoryView({ history }: { history: TestRunRecord[] }) {
  if (history.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-12 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Clock className="h-8 w-8" style={{ opacity: 0.3 }} />
        <span>No test history yet</span>
        <span className="text-[10px]">Run tests to build history</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 p-1">
      {/* Mini chart using simple bars */}
      <div className="mb-2 flex items-end gap-px px-2" style={{ height: "40px" }}>
        {[...history].reverse().slice(-20).map((run) => {
          const total = run.total || 1;
          const passRate = run.passed / total;
          return (
            <div
              key={run.id}
              className="flex-1 rounded-t"
              style={{
                height: `${Math.max(passRate * 100, 4)}%`,
                backgroundColor:
                  run.failed > 0
                    ? "var(--error)"
                    : "var(--success)",
                opacity: 0.7,
                minWidth: "3px",
              }}
              title={`${run.passed}/${run.total} passed — ${new Date(run.ranAt).toLocaleString()}`}
            />
          );
        })}
      </div>

      {/* Table */}
      <div className="space-y-px">
        {history.map((run) => (
          <div
            key={run.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-[10px]"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{
                backgroundColor:
                  run.failed > 0 ? "var(--error)" : "var(--success)",
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>
              {new Date(run.ranAt + "Z").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span style={{ color: "var(--success)" }}>{run.passed}P</span>
            {run.failed > 0 && (
              <span style={{ color: "var(--error)" }}>{run.failed}F</span>
            )}
            {run.skipped > 0 && (
              <span style={{ color: "var(--text-muted)" }}>{run.skipped}S</span>
            )}
            <span
              className="ml-auto"
              style={{ color: "var(--text-muted)" }}
            >
              {formatDuration(run.durationMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
