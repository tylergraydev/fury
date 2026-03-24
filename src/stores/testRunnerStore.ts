import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TestRunEvent,
  TestRunSummary,
  TestSuite,
  TestRunnerConfig,
  TestStatus,
  TestRunRecord,
  CoverageReport,
} from "../lib/tauri";
import {
  runTests as runTestsCmd,
  stopTests as stopTestsCmd,
  getTestRunnerConfig as getConfigCmd,
  detectTestFramework as detectCmd,
  saveTestRunnerConfig as saveConfigCmd,
  startTestWatch as startWatchCmd,
  stopTestWatch as stopWatchCmd,
  listTestHistory as listHistoryCmd,
  runCoverage as runCoverageCmd,
} from "../lib/tauri";

type FilterValue = "all" | "failed" | "passed" | "skipped";

interface TestRunnerStore {
  // Per-context state
  suites: Record<string, TestSuite[]>;
  summary: Record<string, TestRunSummary | null>;
  output: Record<string, string[]>;
  running: Record<string, boolean>;
  error: Record<string, string | null>;
  config: Record<string, TestRunnerConfig | null>;

  // UI state
  filter: Record<string, FilterValue>;
  expandedSuites: Record<string, Set<string>>;
  selectedTest: Record<string, { suite: string; name: string } | null>;
  showOutput: Record<string, boolean>;
  watchMode: Record<string, boolean>;
  history: Record<string, TestRunRecord[]>;
  coverage: Record<string, CoverageReport | null>;
  coverageRunning: Record<string, boolean>;

  // Event subscriptions
  subscriptions: Record<string, UnlistenFn[]>;
  watchSubscriptions: Record<string, UnlistenFn>;

  // Actions
  subscribe: (contextId: string) => Promise<void>;
  unsubscribe: (contextId: string) => void;
  loadConfig: (contextId: string, repoId: string) => Promise<void>;
  detectFramework: (contextId: string, repoId: string) => Promise<void>;
  saveConfig: (repoId: string, config: TestRunnerConfig) => Promise<void>;
  runTests: (
    contextId: string,
    contextType: "workspace" | "repo",
    fileFilter?: string,
  ) => Promise<void>;
  stopTests: (contextId: string) => Promise<void>;
  setFilter: (contextId: string, filter: FilterValue) => void;
  toggleSuite: (contextId: string, suiteName: string) => void;
  selectTest: (
    contextId: string,
    suite: string,
    name: string,
  ) => void;
  toggleOutput: (contextId: string) => void;
  clearResults: (contextId: string) => void;
  toggleWatchMode: (
    contextId: string,
    contextType: "workspace" | "repo",
  ) => Promise<void>;
  loadHistory: (contextId: string, repoId: string) => Promise<void>;
  runCoverage: (
    contextId: string,
    contextType: "workspace" | "repo",
  ) => Promise<void>;
}

const MAX_OUTPUT_LINES = 5000;

export const useTestRunnerStore = create<TestRunnerStore>((set, get) => ({
  suites: {},
  summary: {},
  output: {},
  running: {},
  error: {},
  config: {},
  filter: {},
  expandedSuites: {},
  selectedTest: {},
  showOutput: {},
  watchMode: {},
  history: {},
  coverage: {},
  coverageRunning: {},
  subscriptions: {},
  watchSubscriptions: {},

  subscribe: async (contextId: string) => {
    if (get().subscriptions[contextId]) return;

    const unlistenRunner = await listen<TestRunEvent>(
      `test-runner:${contextId}`,
      (event) => {
        const payload = event.payload;
        switch (payload.type) {
          case "suiteUpdate": {
            set((state) => {
              const current = state.suites[contextId] ?? [];
              const idx = current.findIndex(
                (s) => s.name === payload.suite.name,
              );
              const updated =
                idx >= 0
                  ? current.map((s, i) => (i === idx ? payload.suite : s))
                  : [...current, payload.suite];
              return { suites: { ...state.suites, [contextId]: updated } };
            });
            break;
          }
          case "runComplete": {
            set((state) => ({
              summary: { ...state.summary, [contextId]: payload.summary },
              suites: { ...state.suites, [contextId]: payload.summary.suites },
              running: { ...state.running, [contextId]: false },
            }));
            break;
          }
          case "outputLine": {
            const prefix =
              payload.stream === "stderr" ? "[stderr] " : "";
            set((state) => {
              const currentOutput = state.output[contextId] ?? [];
              const newOutput = [...currentOutput, prefix + payload.line];
              const trimmed = newOutput.length > MAX_OUTPUT_LINES
                ? newOutput.slice(-MAX_OUTPUT_LINES)
                : newOutput;
              return {
                output: {
                  ...state.output,
                  [contextId]: trimmed,
                },
              };
            });
            break;
          }
          case "error": {
            set((state) => ({
              error: { ...state.error, [contextId]: payload.message },
              running: { ...state.running, [contextId]: false },
            }));
            break;
          }
          case "coverageResult": {
            set((state) => ({
              coverage: { ...state.coverage, [contextId]: payload.report },
              coverageRunning: { ...state.coverageRunning, [contextId]: false },
            }));
            break;
          }
        }
      },
    );

    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [contextId]: [unlistenRunner],
      },
    }));
  },

  unsubscribe: (contextId: string) => {
    const unsubs = get().subscriptions[contextId];
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      set((state) => {
        const { [contextId]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
    // Also clean up watch mode if active
    const watchUnsub = get().watchSubscriptions[contextId];
    if (watchUnsub) {
      watchUnsub();
      stopWatchCmd(contextId).catch(() => {});
      set((state) => {
        const { [contextId]: _w, ...restWatch } = state.watchSubscriptions;
        return {
          watchSubscriptions: restWatch,
          watchMode: { ...state.watchMode, [contextId]: false },
        };
      });
    }
  },

  loadConfig: async (contextId: string, repoId: string) => {
    try {
      const config = await getConfigCmd(repoId);
      set((state) => ({
        config: { ...state.config, [contextId]: config },
      }));
    } catch (e) {
      console.error("[testRunnerStore] Failed to load config:", e);
    }
  },

  detectFramework: async (contextId: string, repoId: string) => {
    try {
      const config = await detectCmd(repoId);
      set((state) => ({
        config: { ...state.config, [contextId]: config },
      }));
    } catch (e) {
      console.error("[testRunnerStore] Failed to detect framework:", e);
    }
  },

  saveConfig: async (repoId: string, config: TestRunnerConfig) => {
    try {
      await saveConfigCmd(repoId, config);
    } catch (e) {
      console.error("[testRunnerStore] Failed to save config:", e);
    }
  },

  runTests: async (
    contextId: string,
    contextType: "workspace" | "repo",
    fileFilter?: string,
  ) => {
    set((state) => ({
      running: { ...state.running, [contextId]: true },
      error: { ...state.error, [contextId]: null },
      output: { ...state.output, [contextId]: [] },
      summary: { ...state.summary, [contextId]: null },
      // Mark existing suites as "running"
      suites: {
        ...state.suites,
        [contextId]: (state.suites[contextId] ?? []).map((s) => ({
          ...s,
          status: "running" as TestStatus,
          tests: s.tests.map((t) => ({
            ...t,
            status: "running" as TestStatus,
          })),
        })),
      },
    }));
    try {
      await runTestsCmd(contextId, contextType, fileFilter);
    } catch (e) {
      set((state) => ({
        running: { ...state.running, [contextId]: false },
        error: {
          ...state.error,
          [contextId]: `Failed to start tests: ${String(e)}`,
        },
      }));
    }
  },

  stopTests: async (contextId: string) => {
    try {
      await stopTestsCmd(contextId);
      set((state) => ({
        running: { ...state.running, [contextId]: false },
      }));
    } catch (e) {
      console.error("[testRunnerStore] Failed to stop tests:", e);
    }
  },

  setFilter: (contextId: string, filter: FilterValue) => {
    set((state) => ({
      filter: { ...state.filter, [contextId]: filter },
    }));
  },

  toggleSuite: (contextId: string, suiteName: string) => {
    set((state) => {
      const current = state.expandedSuites[contextId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(suiteName)) {
        next.delete(suiteName);
      } else {
        next.add(suiteName);
      }
      return {
        expandedSuites: { ...state.expandedSuites, [contextId]: next },
      };
    });
  },

  selectTest: (contextId: string, suite: string, name: string) => {
    set((state) => ({
      selectedTest: { ...state.selectedTest, [contextId]: { suite, name } },
    }));
  },

  toggleOutput: (contextId: string) => {
    set((state) => ({
      showOutput: {
        ...state.showOutput,
        [contextId]: !state.showOutput[contextId],
      },
    }));
  },

  clearResults: (contextId: string) => {
    set((state) => ({
      suites: { ...state.suites, [contextId]: [] },
      summary: { ...state.summary, [contextId]: null },
      output: { ...state.output, [contextId]: [] },
      error: { ...state.error, [contextId]: null },
      selectedTest: { ...state.selectedTest, [contextId]: null },
    }));
  },

  toggleWatchMode: async (
    contextId: string,
    contextType: "workspace" | "repo",
  ) => {
    const isActive = get().watchMode[contextId] ?? false;

    if (isActive) {
      // Disable watch mode
      const unsub = get().watchSubscriptions[contextId];
      if (unsub) unsub();
      await stopWatchCmd(contextId).catch(() => {});
      set((state) => {
        const { [contextId]: _w, ...restWatch } = state.watchSubscriptions;
        return {
          watchSubscriptions: restWatch,
          watchMode: { ...state.watchMode, [contextId]: false },
        };
      });
    } else {
      // Enable watch mode
      try {
        await startWatchCmd(contextId, contextType);
        const unlisten = await listen(
          `test-watch:${contextId}`,
          () => {
            // Only re-run if not already running
            if (!get().running[contextId]) {
              get().runTests(contextId, contextType);
            }
          },
        );
        set((state) => ({
          watchMode: { ...state.watchMode, [contextId]: true },
          watchSubscriptions: {
            ...state.watchSubscriptions,
            [contextId]: unlisten,
          },
        }));
      } catch (e) {
        console.error("[testRunnerStore] Failed to start watch mode:", e);
      }
    }
  },

  loadHistory: async (contextId: string, repoId: string) => {
    try {
      const records = await listHistoryCmd(repoId, 20);
      set((state) => ({
        history: { ...state.history, [contextId]: records },
      }));
    } catch (e) {
      console.error("[testRunnerStore] Failed to load history:", e);
    }
  },

  runCoverage: async (
    contextId: string,
    contextType: "workspace" | "repo",
  ) => {
    set((state) => ({
      coverageRunning: { ...state.coverageRunning, [contextId]: true },
      coverage: { ...state.coverage, [contextId]: null },
    }));
    try {
      await runCoverageCmd(contextId, contextType);
    } catch (e) {
      set((state) => ({
        coverageRunning: { ...state.coverageRunning, [contextId]: false },
        error: {
          ...state.error,
          [contextId]: `Coverage failed: ${String(e)}`,
        },
      }));
    }
  },
}));
