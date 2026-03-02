import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Settings,
  ChevronRight,
  ChevronDown,
  Trash2,
  Terminal,
  ListTree,
  AlertTriangle,
} from "lucide-react";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { TestSuite, TestResult, TestStatus } from "../../lib/tauri";
import { TestConfigDialog } from "./TestConfigDialog";

const EMPTY_SUITES: TestSuite[] = [];
const EMPTY_OUTPUT: string[] = [];
const EMPTY_EXPANDED = new Set<string>();

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
}

function statusDotColor(status: TestStatus): string {
  switch (status) {
    case "passed":
      return "var(--success)";
    case "failed":
      return "var(--error)";
    case "skipped":
      return "var(--text-muted)";
    case "running":
      return "var(--text-muted)";
    case "pending":
      return "var(--border)";
  }
}

function statusLabel(status: TestStatus): string {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "running":
      return "running";
    case "pending":
      return "pending";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TestCaseRow({
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
      />
      <span
        className="truncate text-left"
        style={{ color: "var(--text-primary)" }}
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

function TestSuiteRow({
  suite,
  contextId,
  expanded,
  selectedTest,
  filter,
}: {
  suite: TestSuite;
  contextId: string;
  expanded: boolean;
  selectedTest: { suite: string; name: string } | null;
  filter: string;
}) {
  const color = statusDotColor(suite.status);
  const isRunning = suite.status === "running";

  const passedCount = suite.tests.filter((t) => t.status === "passed").length;
  const failedCount = suite.tests.filter((t) => t.status === "failed").length;
  const totalCount = suite.tests.length;

  const filteredTests = suite.tests.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  // If filtering and no tests match, hide the suite
  if (filter !== "all" && filteredTests.length === 0) return null;

  return (
    <div>
      <button
        onClick={() =>
          useTestRunnerStore.getState().toggleSuite(contextId, suite.name)
        }
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-surface)]"
      >
        {expanded ? (
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
        />
        <span
          className="truncate text-left"
          style={{ color: "var(--text-primary)" }}
        >
          {suite.name}
        </span>
        <span
          className="ml-auto flex-shrink-0 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {failedCount > 0 && (
            <span style={{ color: "var(--error)" }}>{failedCount}F </span>
          )}
          {passedCount > 0 && (
            <span style={{ color: "var(--success)" }}>{passedCount}P </span>
          )}
          {totalCount > passedCount + failedCount && (
            <span>{totalCount - passedCount - failedCount}S</span>
          )}
        </span>
      </button>

      {expanded && (
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

export function TestRunnerPanel({ contextId, contextType }: Props) {
  const suites = useTestRunnerStore(
    (s) => s.suites[contextId] ?? EMPTY_SUITES,
  );
  const summary = useTestRunnerStore(
    (s) => s.summary[contextId] ?? null,
  );
  const output = useTestRunnerStore(
    (s) => s.output[contextId] ?? EMPTY_OUTPUT,
  );
  const running = useTestRunnerStore(
    (s) => s.running[contextId] ?? false,
  );
  const error = useTestRunnerStore(
    (s) => s.error[contextId] ?? null,
  );
  const config = useTestRunnerStore(
    (s) => s.config[contextId] ?? null,
  );
  const filter = useTestRunnerStore(
    (s) => s.filter[contextId] ?? "all",
  );
  const expandedSuites = useTestRunnerStore(
    (s) => s.expandedSuites[contextId] ?? EMPTY_EXPANDED,
  );
  const selectedTest = useTestRunnerStore(
    (s) => s.selectedTest[contextId] ?? null,
  );
  const showOutput = useTestRunnerStore(
    (s) => s.showOutput[contextId] ?? false,
  );

  const [showConfig, setShowConfig] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Resolve repoId from context
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const repoId =
    contextType === "workspace"
      ? workspaces.find((w) => w.id === contextId)?.repoId ?? contextId
      : contextId;

  // Subscribe to events and load config on mount
  useEffect(() => {
    const store = useTestRunnerStore.getState();
    store.subscribe(contextId);
    store.loadConfig(contextId, repoId);
    return () => useTestRunnerStore.getState().unsubscribe(contextId);
  }, [contextId, repoId]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = () => {
    useTestRunnerStore.getState().runTests(contextId, contextType);
  };

  const handleStop = () => {
    useTestRunnerStore.getState().stopTests(contextId);
  };

  const handleClear = () => {
    useTestRunnerStore.getState().clearResults(contextId);
  };

  // Find the selected test's failure message
  const selectedFailure = selectedTest
    ? suites
        .find((s) => s.name === selectedTest.suite)
        ?.tests.find((t) => t.name === selectedTest.name)?.failureMessage
    : null;

  const filterButtons: { label: string; value: "all" | "failed" | "passed" | "skipped" }[] = [
    { label: "All", value: "all" },
    { label: "Failed", value: "failed" },
    { label: "Passed", value: "passed" },
    { label: "Skipped", value: "skipped" },
  ];

  const frameworkLabel = config?.framework
    ? config.framework.charAt(0).toUpperCase() + config.framework.slice(1)
    : "Not configured";

  const hasNoConfig = !config?.framework && !config?.testCommand;

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {frameworkLabel}
        </span>

        {/* Summary badges */}
        {summary && (
          <div className="flex items-center gap-1.5">
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--text-muted) 15%, transparent)",
                color: "var(--text-primary)",
              }}
            >
              {summary.total} tests
            </span>
            {summary.passed > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--success) 15%, transparent)",
                  color: "var(--success)",
                }}
              >
                {summary.passed} passed
              </span>
            )}
            {summary.failed > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--error) 15%, transparent)",
                  color: "var(--error)",
                }}
              >
                {summary.failed} failed
              </span>
            )}
            {summary.skipped > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--text-muted) 15%, transparent)",
                  color: "var(--text-muted)",
                }}
              >
                {summary.skipped} skipped
              </span>
            )}
            {summary.durationMs > 0 && (
              <span
                className="text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                {formatDuration(summary.durationMs)}
              </span>
            )}
          </div>
        )}

        {running && (
          <span
            className="animate-pulse text-[10px]"
            style={{ color: "var(--success)" }}
          >
            Running...
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 rounded px-2 py-0.5"
              style={{
                backgroundColor: "var(--error)",
                color: "var(--bg-primary)",
              }}
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={hasNoConfig}
              className="flex items-center gap-1 rounded px-2 py-0.5 disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              <Play className="h-3 w-3" />
              Run All
            </button>
          )}
          <button
            onClick={handleClear}
            className="rounded px-1.5 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
            title="Clear results"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => setShowConfig(true)}
            className="rounded px-1.5 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
            title="Configure test runner"
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center gap-1 px-3 py-1"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() =>
              useTestRunnerStore.getState().setFilter(contextId, btn.value)
            }
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor:
                filter === btn.value
                  ? "var(--bg-surface)"
                  : "transparent",
              color:
                filter === btn.value
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
            }}
          >
            {btn.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() =>
              useTestRunnerStore.getState().toggleOutput(contextId)
            }
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: showOutput
                ? "var(--bg-surface)"
                : "transparent",
              color: showOutput
                ? "var(--text-primary)"
                : "var(--text-muted)",
            }}
          >
            <Terminal className="h-3 w-3" />
            Output
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
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

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Test tree */}
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {suites.length === 0 && !running ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-12 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <ListTree className="h-8 w-8" style={{ opacity: 0.3 }} />
              {hasNoConfig ? (
                <>
                  <span>No test framework detected</span>
                  <button
                    onClick={() => setShowConfig(true)}
                    className="rounded px-3 py-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Configure Test Runner
                  </button>
                </>
              ) : (
                <>
                  <span>No test results yet</span>
                  <span className="text-[10px]">
                    Click &quot;Run All&quot; to execute tests
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {suites.map((suite) => (
                <TestSuiteRow
                  key={suite.name}
                  suite={suite}
                  contextId={contextId}
                  expanded={expandedSuites.has(suite.name)}
                  selectedTest={selectedTest}
                  filter={filter}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail / Output pane */}
        {(selectedFailure || showOutput) && (
          <div
            className="max-h-64 overflow-hidden border-t"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            {showOutput ? (
              <div className="flex h-full flex-col">
                <div
                  className="flex items-center px-3 py-1 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Raw Output ({output.length} lines)
                </div>
                <div
                  ref={outputRef}
                  className="flex-1 overflow-auto px-2 py-1 font-mono text-[10px] leading-relaxed"
                  style={{
                    color: "var(--text-secondary)",
                    maxHeight: "200px",
                  }}
                >
                  {output.length === 0 ? (
                    <span style={{ color: "var(--text-muted)" }}>
                      No output yet.
                    </span>
                  ) : (
                    output.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          color: line.startsWith("[stderr]")
                            ? "var(--error)"
                            : undefined,
                        }}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              selectedFailure && (
                <div className="flex h-full flex-col">
                  <div
                    className="flex items-center px-3 py-1 text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Failure Details — {selectedTest?.name}
                  </div>
                  <pre
                    className="flex-1 overflow-auto px-3 py-1 text-[10px] leading-relaxed"
                    style={{
                      color: "var(--error)",
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      maxHeight: "200px",
                    }}
                  >
                    {selectedFailure}
                  </pre>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Config dialog */}
      {showConfig && (
        <TestConfigDialog
          contextId={contextId}
          repoId={repoId}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
