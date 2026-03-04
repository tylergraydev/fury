import { useEffect, useState } from "react";
import { X, RotateCw } from "lucide-react";
import { useTestRunnerStore } from "../../stores/testRunnerStore";
import type { TestRunnerConfig } from "../../lib/tauri";

interface Props {
  contextId: string;
  repoId: string;
  onClose: () => void;
}

export function TestConfigDialog({ contextId, repoId, onClose }: Props) {
  const config = useTestRunnerStore(
    (s) => s.config[contextId] ?? null,
  );

  const [framework, setFramework] = useState(config?.framework ?? "");
  const [testCommand, setTestCommand] = useState(config?.testCommand ?? "");
  const [testFileCommand, setTestFileCommand] = useState(
    config?.testFileCommand ?? "",
  );
  const [workingDir, setWorkingDir] = useState(config?.workingDir ?? "");
  const [coverageCommand, setCoverageCommand] = useState(
    config?.coverageCommand ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (config) {
      setFramework(config.framework ?? "");
      setTestCommand(config.testCommand ?? "");
      setTestFileCommand(config.testFileCommand ?? "");
      setWorkingDir(config.workingDir ?? "");
      setCoverageCommand(config.coverageCommand ?? "");
    }
  }, [config]);

  const handleDetect = async () => {
    setDetecting(true);
    await useTestRunnerStore.getState().detectFramework(contextId, repoId);
    setDetecting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const newConfig: TestRunnerConfig = {
      framework: (framework as TestRunnerConfig["framework"]) || null,
      testCommand: testCommand || null,
      testFileCommand: testFileCommand || null,
      workingDir: workingDir || null,
      coverageCommand: coverageCommand || null,
    };
    await useTestRunnerStore.getState().saveConfig(repoId, newConfig);
    await useTestRunnerStore.getState().loadConfig(contextId, repoId);
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg shadow-xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Test Runner Configuration
          </span>
          <button onClick={onClose}>
            <X
              className="h-4 w-4"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-4">
          {/* Framework */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Framework
            </label>
            <div className="flex items-center gap-2">
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="">Not set</option>
                <option value="vitest">Vitest</option>
                <option value="jest">Jest</option>
                <option value="pytest">Pytest</option>
                <option value="cargotest">Cargo Test</option>
                <option value="gotest">Go Test</option>
                <option value="custom">Custom</option>
              </select>
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                <RotateCw
                  className={`h-3 w-3 ${detecting ? "animate-spin" : ""}`}
                />
                Detect
              </button>
            </div>
          </div>

          {/* Test Command */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Test Command (run all tests)
            </label>
            <input
              type="text"
              value={testCommand}
              onChange={(e) => setTestCommand(e.target.value)}
              placeholder="e.g., npx vitest --reporter=json --run"
              className="rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Test File Command */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Test File Command (use {"{file}"} as placeholder)
            </label>
            <input
              type="text"
              value={testFileCommand}
              onChange={(e) => setTestFileCommand(e.target.value)}
              placeholder="e.g., npx vitest --reporter=json --run {file}"
              className="rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Working Directory */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Working Directory (relative to repo root, optional)
            </label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="e.g., packages/core"
              className="rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Coverage Command */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Coverage Command (optional, auto-detected for vitest/jest/pytest)
            </label>
            <input
              type="text"
              value={coverageCommand}
              onChange={(e) => setCoverageCommand(e.target.value)}
              placeholder="e.g., npx vitest --coverage --reporter=json --run"
              className="rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded px-3 py-1 text-xs disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
