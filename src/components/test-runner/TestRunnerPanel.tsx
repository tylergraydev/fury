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
  Search,
  RotateCcw,
  Eye,
  EyeOff,
  Clock,
  BarChart3,
} from "lucide-react";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { TestSuite, TestResult, TestStatus, TestRunRecord, CoverageReport } from "../../lib/tauri";
import { TestConfigDialog } from "./TestConfigDialog";

const EMPTY_SUITES: TestSuite[] = [];
const EMPTY_OUTPUT: string[] = [];
const EMPTY_EXPANDED = new Set<string>();
const EMPTY_HISTORY: TestRunRecord[] = [];

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

// ANSI SGR escape sequence parser
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

const ANSI_COLORS: Record<number, string> = {
  30: "var(--text-muted)",
  31: "var(--error)",
  32: "var(--success)",
  33: "var(--warning)",
  34: "var(--accent)",
  35: "var(--error)",      // magenta → error color
  36: "var(--accent)",     // cyan → accent
  37: "var(--text-primary)",
  90: "var(--text-muted)",
  91: "var(--error)",
  92: "var(--success)",
  93: "var(--warning)",
  94: "var(--accent)",
  95: "var(--error)",
  96: "var(--accent)",
  97: "var(--text-primary)",
};

function parseAnsi(line: string): React.ReactNode {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let currentColor: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;

  // Reset regex state
  ANSI_REGEX.lastIndex = 0;

  while ((match = ANSI_REGEX.exec(line)) !== null) {
    // Push text before this escape sequence
    if (match.index > lastIndex) {
      const text = line.slice(lastIndex, match.index);
      if (text) {
        segments.push(
          <span
            key={segments.length}
            style={{
              color: currentColor,
              fontWeight: bold ? "bold" : undefined,
            }}
          >
            {text}
          </span>,
        );
      }
    }
    lastIndex = match.index + match[0].length;

    // Parse SGR codes
    const codes = match[1].split(";").map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        bold = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code];
      }
    }
  }

  // Push remaining text
  if (lastIndex < line.length) {
    const text = line.slice(lastIndex);
    if (text) {
      segments.push(
        <span
          key={segments.length}
          style={{
            color: currentColor,
            fontWeight: bold ? "bold" : undefined,
          }}
        >
          {text}
        </span>,
      );
    }
  }

  // If no ANSI codes found, return the plain string
  if (segments.length === 0) return line;
  return <>{segments}</>;
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

  // If filtering and no tests match, hide the suite
  if ((filter !== "all" || nameFilter) && filteredTests.length === 0) return null;

  // Auto-expand when name filter matches
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

function HistoryView({ history }: { history: TestRunRecord[] }) {
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

  // Show runs in reverse chronological order (most recent first)
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

function CoverageView({ coverage }: { coverage: CoverageReport }) {
  return (
    <div className="space-y-0.5 p-1">
      {/* Total coverage bar */}
      <div
        className="mb-2 flex items-center gap-2 rounded px-2 py-1.5"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <BarChart3
          className="h-4 w-4 flex-shrink-0"
          style={{ color: "var(--accent)" }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Total Coverage
        </span>
        <div
          className="ml-auto flex items-center gap-2"
        >
          <div
            className="h-2 w-24 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(coverage.totalLinesPct, 100)}%`,
                backgroundColor:
                  coverage.totalLinesPct >= 80
                    ? "var(--success)"
                    : coverage.totalLinesPct >= 50
                      ? "var(--warning)"
                      : "var(--error)",
              }}
            />
          </div>
          <span
            className="text-xs font-medium"
            style={{
              color:
                coverage.totalLinesPct >= 80
                  ? "var(--success)"
                  : coverage.totalLinesPct >= 50
                    ? "var(--warning)"
                    : "var(--error)",
            }}
          >
            {coverage.totalLinesPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Per-file coverage */}
      <div className="space-y-px">
        {coverage.files
          .sort((a, b) => a.linesPct - b.linesPct)
          .map((file) => (
            <div
              key={file.file}
              className="flex items-center gap-2 rounded px-2 py-0.5 text-[10px]"
            >
              <span
                className="flex-1 truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {file.file}
              </span>
              <div
                className="h-1.5 w-16 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(file.linesPct, 100)}%`,
                    backgroundColor:
                      file.linesPct >= 80
                        ? "var(--success)"
                        : file.linesPct >= 50
                          ? "var(--warning)"
                          : "var(--error)",
                  }}
                />
              </div>
              <span
                className="w-10 text-right"
                style={{
                  color:
                    file.linesPct >= 80
                      ? "var(--success)"
                      : file.linesPct >= 50
                        ? "var(--warning)"
                        : "var(--error)",
                }}
              >
                {file.linesPct.toFixed(0)}%
              </span>
            </div>
          ))}
      </div>
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
  const watchMode = useTestRunnerStore(
    (s) => s.watchMode[contextId] ?? false,
  );

  const history = useTestRunnerStore(
    (s) => s.history[contextId] ?? EMPTY_HISTORY,
  );
  const coverage = useTestRunnerStore(
    (s) => s.coverage[contextId] ?? null,
  );
  const coverageRunning = useTestRunnerStore(
    (s) => s.coverageRunning[contextId] ?? false,
  );

  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
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
    store.loadHistory(contextId, repoId);
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

  const handleRunSuite = (suiteName: string) => {
    useTestRunnerStore.getState().runTests(contextId, contextType, suiteName);
  };

  const handleRerunFailed = () => {
    const failedSuites = suites
      .filter((s) => s.status === "failed")
      .map((s) => s.name);
    if (failedSuites.length === 1) {
      useTestRunnerStore.getState().runTests(contextId, contextType, failedSuites[0]);
    } else {
      useTestRunnerStore.getState().runTests(contextId, contextType);
    }
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
  const hasFailedTests = (summary?.failed ?? 0) > 0 && !running;

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
          {hasFailedTests && (
            <button
              onClick={handleRerunFailed}
              className="flex items-center gap-1 rounded px-2 py-0.5"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--error)",
              }}
              title="Re-run failed tests"
            >
              <RotateCcw className="h-3 w-3" />
              Re-run Failed
            </button>
          )}
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
            onClick={() =>
              useTestRunnerStore.getState().toggleWatchMode(contextId, contextType)
            }
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: watchMode
                ? "color-mix(in srgb, var(--success) 15%, transparent)"
                : "var(--bg-surface)",
              color: watchMode
                ? "var(--success)"
                : "var(--text-secondary)",
            }}
            title={watchMode ? "Disable watch mode" : "Enable watch mode"}
          >
            {watchMode ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            Watch
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: showHistory
                ? "var(--bg-surface)"
                : "var(--bg-surface)",
              color: showHistory
                ? "var(--text-primary)"
                : "var(--text-secondary)",
            }}
            title="Test history"
          >
            <Clock className="h-3 w-3" />
            History
          </button>
          <button
            onClick={() => {
              if (!showCoverage) {
                setShowCoverage(true);
                if (!coverage && !coverageRunning) {
                  useTestRunnerStore.getState().runCoverage(contextId, contextType);
                }
              } else {
                setShowCoverage(false);
              }
            }}
            disabled={coverageRunning}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] disabled:opacity-50"
            style={{
              backgroundColor: showCoverage
                ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                : "var(--bg-surface)",
              color: showCoverage
                ? "var(--accent)"
                : "var(--text-secondary)",
            }}
            title={coverageRunning ? "Running coverage..." : "Code coverage"}
          >
            <BarChart3 className={`h-3 w-3 ${coverageRunning ? "animate-pulse" : ""}`} />
            {coverageRunning ? "Running..." : coverage ? `${coverage.totalLinesPct.toFixed(0)}%` : "Coverage"}
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

        {/* Name search */}
        <div className="relative ml-2 flex items-center">
          <Search
            className="absolute left-1.5 h-3 w-3"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter tests..."
            className="rounded py-0.5 pl-6 pr-2 text-[10px] outline-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              width: "140px",
            }}
          />
        </div>

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
        {/* Test tree or History view */}
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {showCoverage && coverage ? (
            <CoverageView coverage={coverage} />
          ) : showHistory ? (
            <HistoryView history={history} />
          ) : suites.length === 0 && !running ? (
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
                  nameFilter={nameFilter}
                  onRunSuite={handleRunSuite}
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
                        {parseAnsi(line)}
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
