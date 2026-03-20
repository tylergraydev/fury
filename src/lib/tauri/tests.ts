import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { TestRunnerConfig, TestRunRecord } from "./types";

// Test runner commands
export async function detectTestFramework(
  repoId: string,
): Promise<TestRunnerConfig> {
  return invoke<TestRunnerConfig>("detect_test_framework", { repoId });
}

export async function getTestRunnerConfig(
  repoId: string,
): Promise<TestRunnerConfig> {
  return invoke<TestRunnerConfig>("get_test_runner_config", { repoId });
}

export async function saveTestRunnerConfig(
  repoId: string,
  config: TestRunnerConfig,
): Promise<void> {
  return invoke("save_test_runner_config", { repoId, config });
}

export async function runTests(
  contextId: string,
  contextType: string,
  fileFilter?: string,
): Promise<void> {
  return invoke("run_tests", { contextId, contextType, fileFilter });
}

export async function stopTests(contextId: string): Promise<void> {
  return invoke("stop_tests", { contextId });
}

export async function startTestWatch(
  contextId: string,
  contextType: string,
): Promise<void> {
  return invoke("start_test_watch", { contextId, contextType });
}

export async function stopTestWatch(contextId: string): Promise<void> {
  return invoke("stop_test_watch", { contextId });
}

export async function listTestHistory(
  repoId: string,
  limit?: number,
): Promise<TestRunRecord[]> {
  return invoke("list_test_history", { repoId, limit });
}

export async function runCoverage(
  contextId: string,
  contextType: string,
): Promise<void> {
  return invoke("run_coverage", { contextId, contextType });
}
