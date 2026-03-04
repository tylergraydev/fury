import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestConfigDialog } from "./TestConfigDialog";
import { useTestRunnerStore } from "../../stores/testRunnerStore";

vi.mock("../../lib/tauri", () => ({
  runTests: vi.fn(),
  stopTests: vi.fn(),
  getTestRunnerConfig: vi.fn(),
  detectTestFramework: vi.fn(),
  saveTestRunnerConfig: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const CTX = "ctx-1";
const REPO = "repo-1";

const saveConfig = vi.fn().mockResolvedValue(undefined);
const loadConfig = vi.fn().mockResolvedValue(undefined);
const detectFramework = vi.fn().mockResolvedValue(undefined);
const onClose = vi.fn();

beforeEach(() => {
  useTestRunnerStore.setState({
    config: {},
    saveConfig,
    loadConfig,
    detectFramework,
  } as any);
  vi.clearAllMocks();
});

describe("TestConfigDialog", () => {
  it("renders with current config values", () => {
    useTestRunnerStore.setState({
      config: {
        [CTX]: {
          framework: "vitest",
          testCommand: "npx vitest --run",
          testFileCommand: "npx vitest {file}",
          workingDir: "packages/core",
        },
      },
      saveConfig,
      loadConfig,
      detectFramework,
    } as any);
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Vitest") as HTMLSelectElement;
    expect(select.value).toBe("vitest");

    const inputs = screen.getAllByRole("textbox");
    expect((inputs[0] as HTMLInputElement).value).toBe("npx vitest --run");
    expect((inputs[1] as HTMLInputElement).value).toBe("npx vitest {file}");
    expect((inputs[2] as HTMLInputElement).value).toBe("packages/core");
  });

  it("renders with empty values when no config", () => {
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Not set") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("Detect button calls detectFramework", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    await user.click(screen.getByText("Detect"));
    expect(detectFramework).toHaveBeenCalledWith(CTX, REPO);
  });

  it("Save calls saveConfig then loadConfig then closes", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    await user.click(screen.getByText("Save"));

    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: null,
      testFileCommand: null,
      workingDir: null,
      coverageCommand: null,
    });
    expect(loadConfig).toHaveBeenCalledWith(CTX, REPO);
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel calls onClose", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking backdrop calls onClose", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    // The outermost overlay div
    const overlay = container.firstElementChild as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("framework dropdown has correct options", () => {
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const options = screen.getAllByRole("option");
    const values = options.map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual([
      "",
      "vitest",
      "jest",
      "pytest",
      "cargotest",
      "gotest",
      "custom",
    ]);
  });

  it("constructs config correctly with empty strings as null", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    await user.click(screen.getByText("Save"));

    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: null,
      testFileCommand: null,
      workingDir: null,
      coverageCommand: null,
    });
  });

  it("syncs form when config changes", () => {
    const { rerender } = render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    // Simulate config update from store
    useTestRunnerStore.setState({
      config: {
        [CTX]: {
          framework: "jest",
          testCommand: "npx jest",
          testFileCommand: null,
          workingDir: null,
        },
      },
      saveConfig,
      loadConfig,
      detectFramework,
    } as any);

    rerender(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Jest") as HTMLSelectElement;
    expect(select.value).toBe("jest");
  });
});
