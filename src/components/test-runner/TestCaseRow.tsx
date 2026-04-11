import { useTestRunnerStore } from "../../stores/testRunnerStore";
import type { TestResult } from "../../lib/tauri";
import { statusDotColor, statusLabel, formatDuration } from "../../lib/testRunnerUtils";

export function TestCaseRow({
  test,
  contextId,
  isSelected,
}: {
  test: TestResult;
  contextId: string;
  isSelected: boolean;
}) {
  const color = statusDotColor(test.status);
  const isRunning = test.status === "running";

  return (
    <button
      onClick={() =>
        useTestRunnerStore.getState().selectTest(contextId, test.suite, test.name)
      }
      className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[10px] transition-colors"
      style={{
        backgroundColor: isSelected
          ? "var(--bg-surface)"
          : undefined,
      }}
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
        title={test.status}
      />
      <span
        className="truncate text-left"
        style={{ color: "var(--text-primary)" }}
        title={test.name}
      >
        {test.name}
      </span>
      {test.durationMs != null && (
        <span
          className="ml-auto flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          {formatDuration(test.durationMs)}
        </span>
      )}
      <span
        className="flex-shrink-0"
        style={{ color }}
      >
        {statusLabel(test.status)}
      </span>
    </button>
  );
}
