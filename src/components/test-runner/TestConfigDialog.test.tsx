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

  it("syncs form with config where all fields are null", () => {
    const { rerender } = render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    // Config exists but all fields are null — exercises ?? "" fallbacks
    useTestRunnerStore.setState({
      config: {
        [CTX]: {
          framework: null,
          testCommand: null,
          testFileCommand: null,
          workingDir: null,
          coverageCommand: null,
        },
      },
      saveConfig,
      loadConfig,
      detectFramework,
    } as any);

    rerender(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Not set") as HTMLSelectElement;
    expect(select.value).toBe("");
    const inputs = screen.getAllByRole("textbox");
    expect((inputs[0] as HTMLInputElement).value).toBe("");
    expect((inputs[1] as HTMLInputElement).value).toBe("");
    expect((inputs[2] as HTMLInputElement).value).toBe("");
    expect((inputs[3] as HTMLInputElement).value).toBe("");
  });

  it("typing into test command input updates value and saves correctly", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const inputs = screen.getAllByRole("textbox");
    const testCommandInput = inputs[0] as HTMLInputElement;
    await user.type(testCommandInput, "npm test");
    expect(testCommandInput.value).toBe("npm test");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: "npm test",
      testFileCommand: null,
      workingDir: null,
      coverageCommand: null,
    });
  });

  it("typing into test file command input updates value and saves correctly", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const inputs = screen.getAllByRole("textbox");
    const testFileCommandInput = inputs[1] as HTMLInputElement;
    await user.clear(testFileCommandInput);
    await user.click(testFileCommandInput);
    await user.paste("npm test -- {file}");
    expect(testFileCommandInput.value).toBe("npm test -- {file}");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: null,
      testFileCommand: "npm test -- {file}",
      workingDir: null,
      coverageCommand: null,
    });
  });

  it("typing into working directory input updates value and saves correctly", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const inputs = screen.getAllByRole("textbox");
    const workingDirInput = inputs[2] as HTMLInputElement;
    await user.type(workingDirInput, "packages/core");
    expect(workingDirInput.value).toBe("packages/core");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: null,
      testFileCommand: null,
      workingDir: "packages/core",
      coverageCommand: null,
    });
  });

  it("typing into coverage command input updates value and saves correctly", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const inputs = screen.getAllByRole("textbox");
    const coverageInput = inputs[3] as HTMLInputElement;
    await user.type(coverageInput, "npm run coverage");
    expect(coverageInput.value).toBe("npm run coverage");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: null,
      testCommand: null,
      testFileCommand: null,
      workingDir: null,
      coverageCommand: "npm run coverage",
    });
  });

  it("changing framework dropdown updates value and saves correctly", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Not set") as HTMLSelectElement;
    await user.selectOptions(select, "pytest");
    expect(select.value).toBe("pytest");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: "pytest",
      testCommand: null,
      testFileCommand: null,
      workingDir: null,
      coverageCommand: null,
    });
  });

  it("renders all form fields with full config including coverageCommand", () => {
    useTestRunnerStore.setState({
      config: {
        [CTX]: {
          framework: "pytest",
          testCommand: "pytest --json",
          testFileCommand: "pytest {file}",
          workingDir: "backend",
          coverageCommand: "pytest --cov",
        },
      },
      saveConfig,
      loadConfig,
      detectFramework,
    } as any);
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Pytest") as HTMLSelectElement;
    expect(select.value).toBe("pytest");

    const inputs = screen.getAllByRole("textbox");
    expect((inputs[0] as HTMLInputElement).value).toBe("pytest --json");
    expect((inputs[1] as HTMLInputElement).value).toBe("pytest {file}");
    expect((inputs[2] as HTMLInputElement).value).toBe("backend");
    expect((inputs[3] as HTMLInputElement).value).toBe("pytest --cov");
  });

  it("fills all fields and saves with all values populated", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const select = screen.getByDisplayValue("Not set") as HTMLSelectElement;
    await user.selectOptions(select, "cargotest");

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "cargo test");
    await user.click(inputs[1]);
    await user.paste("cargo test {file}");
    await user.type(inputs[2], "crates/core");
    await user.type(inputs[3], "cargo tarpaulin");

    await user.click(screen.getByText("Save"));
    expect(saveConfig).toHaveBeenCalledWith(REPO, {
      framework: "cargotest",
      testCommand: "cargo test",
      testFileCommand: "cargo test {file}",
      workingDir: "crates/core",
      coverageCommand: "cargo tarpaulin",
    });
    expect(loadConfig).toHaveBeenCalledWith(CTX, REPO);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders correct labels for all form fields", () => {
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    expect(screen.getByText("Framework")).toBeInTheDocument();
    expect(
      screen.getByText("Test Command (run all tests)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Test File Command/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Working Directory (relative to repo root, optional)",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Coverage Command (optional, auto-detected for vitest/jest/pytest)",
      ),
    ).toBeInTheDocument();
  });

  it("renders correct placeholder text for inputs", () => {
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    expect(
      screen.getByPlaceholderText("e.g., npx vitest --reporter=json --run"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "e.g., npx vitest --reporter=json --run {file}",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g., packages/core"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "e.g., npx vitest --coverage --reporter=json --run",
      ),
    ).toBeInTheDocument();
  });

  it("clicking inside the dialog does not call onClose", async () => {
    const user = userEvent.setup();
    render(
      <TestConfigDialog contextId={CTX} repoId={REPO} onClose={onClose} />,
    );

    const dialog = screen.getByRole("dialog");
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});
