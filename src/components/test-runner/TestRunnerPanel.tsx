import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Settings,
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
import type { TestSuite, TestRunRecord } from "../../lib/tauri";
import { formatDuration, parseAnsi } from "../../lib/testRunnerUtils";
import { TestConfigDialog } from "./TestConfigDialog";
import { TestSuiteRow } from "./TestSuiteRow";
import { HistoryView } from "./HistoryView";
import { CoverageView } from "./CoverageView";

const EMPTY_SUITES: TestSuite[] = [];
const EMPTY_OUTPUT: string[] = [];
const EMPTY_EXPANDED = new Set<string>();
const EMPTY_HISTORY: TestRunRecord[] = [];

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
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
