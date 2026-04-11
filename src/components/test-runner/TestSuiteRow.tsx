import { ChevronRight, ChevronDown, Play } from "lucide-react";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import type { TestSuite } from "../../lib/tauri";
import { statusDotColor } from "../../lib/testRunnerUtils";
import { TestCaseRow } from "./TestCaseRow";

export function TestSuiteRow({
  suite,
  contextId,
  expanded,
  selectedTest,
  filter,
  nameFilter,
  onRunSuite,
}: {
  suite: TestSuite;
  contextId: string;
  expanded: boolean;
  selectedTest: { suite: string; name: string } | null;
  filter: string;
  nameFilter: string;
  onRunSuite: (suiteName: string) => void;
}) {
  const color = statusDotColor(suite.status);
  const isRunning = suite.status === "running";

  const passedCount = suite.tests.filter((t) => t.status === "passed").length;
  const failedCount = suite.tests.filter((t) => t.status === "failed").length;
  const totalCount = suite.tests.length;

  const filteredTests = suite.tests.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (nameFilter && !t.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    return true;
  });

  if ((filter !== "all" || nameFilter) && filteredTests.length === 0) return null;

  const isExpanded = nameFilter ? true : expanded;

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={() =>
            useTestRunnerStore.getState().toggleSuite(contextId, suite.name)
          }
          className="flex flex-1 items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-surface)]"
        >
          {isExpanded ? (
            <ChevronDown
              className="h-3 w-3 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          ) : (
            <ChevronRight
              className="h-3 w-3 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          )}
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
            style={{ backgroundColor: color }}
            title={suite.status}
          />
          <span
            className="truncate text-left"
            style={{ color: "var(--text-primary)" }}
            title={suite.name}
          >
            {suite.name}
          </span>
          <span
            className="ml-auto flex-shrink-0 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {failedCount > 0 && (
              <span style={{ color: "var(--error)" }} title={`${failedCount} failed`}>{failedCount}F </span>
            )}
            {passedCount > 0 && (
              <span style={{ color: "var(--success)" }} title={`${passedCount} passed`}>{passedCount}P </span>
            )}
            {totalCount > passedCount + failedCount && (
              <span title={`${totalCount - passedCount - failedCount} skipped`}>{totalCount - passedCount - failedCount}S</span>
            )}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRunSuite(suite.name);
          }}
          className="mr-1 flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-surface)]"
          title={`Run ${suite.name}`}
        >
          <Play
            className="h-3 w-3"
            style={{ color: "var(--accent)" }}
          />
        </button>
      </div>

      {isExpanded && (
        <div
          className="ml-4 border-l"
          style={{ borderColor: "var(--border)" }}
        >
          {filteredTests.map((test) => (
            <TestCaseRow
              key={`${test.suite}:${test.name}`}
              test={test}
              contextId={contextId}
              isSelected={
                selectedTest?.suite === test.suite &&
                selectedTest?.name === test.name
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
