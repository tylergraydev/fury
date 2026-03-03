import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunPanel } from "./RunPanel";
import { useScriptStore } from "../../stores/scriptStore";

vi.mock("../../lib/tauri", () => ({
  runWorkspaceScript: vi.fn().mockResolvedValue(undefined),
  stopWorkspaceScript: vi.fn().mockResolvedValue(undefined),
  runRepoScript: vi.fn().mockResolvedValue(undefined),
  stopRepoScript: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockRunScript = vi.fn();
const mockRunRepoScript = vi.fn();
const mockStopScript = vi.fn();
const mockStopRepoScript = vi.fn();
const mockClearOutput = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

beforeEach(() => {
  useScriptStore.setState({
    output: {},
    running: {},
    exitCodes: {},
    subscriptions: {},
    runScript: mockRunScript,
    runRepoScript: mockRunRepoScript,
    stopScript: mockStopScript,
    stopRepoScript: mockStopRepoScript,
    clearOutput: mockClearOutput,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  });
  vi.clearAllMocks();
});

describe("RunPanel", () => {
  it("shows empty state message", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("No output yet. Click Start to run the script.")).toBeInTheDocument();
  });

  it("shows the Run Script label", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Run Script")).toBeInTheDocument();
  });

  it("shows Start button when not running", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Start")).toBeInTheDocument();
  });

  it("shows Stop button when running", () => {
    useScriptStore.setState({ running: { "ws-1:run": true } });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows exit code when finished", () => {
    useScriptStore.setState({ exitCodes: { "ws-1:run": 0 } });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Exit: 0")).toBeInTheDocument();
  });

  it("renders output lines", () => {
    useScriptStore.setState({
      output: { "ws-1:run": ["line 1", "line 2"] },
    });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(screen.getByText("line 2")).toBeInTheDocument();
  });

  it("has a Clear button", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("clicking Start calls runScript for workspace context", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Start"));
    expect(mockRunScript).toHaveBeenCalledWith("ws-1", "run");
  });

  it("clicking Start calls runRepoScript for repo context", () => {
    render(<RunPanel context={{ id: "repo-1", type: "repo" }} />);
    fireEvent.click(screen.getByText("Start"));
    expect(mockRunRepoScript).toHaveBeenCalledWith("repo-1", "run");
  });

  it("clicking Stop calls stopScript for workspace context", () => {
    useScriptStore.setState({ running: { "ws-1:run": true } });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(mockStopScript).toHaveBeenCalledWith("ws-1", "run");
  });

  it("clicking Stop calls stopRepoScript for repo context", () => {
    useScriptStore.setState({ running: { "repo-1:run": true } });
    render(<RunPanel context={{ id: "repo-1", type: "repo" }} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(mockStopRepoScript).toHaveBeenCalledWith("repo-1", "run");
  });

  it("clicking Clear calls clearOutput", () => {
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(mockClearOutput).toHaveBeenCalledWith("ws-1", "run");
  });

  it("subscribes on mount and unsubscribes on unmount", () => {
    const { unmount } = render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(mockSubscribe).toHaveBeenCalledWith("ws-1", "run");
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledWith("ws-1", "run");
  });

  it("styles stderr lines with error color", () => {
    useScriptStore.setState({
      output: { "ws-1:run": ["[stderr] error msg", "normal line"] },
    });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    const stderrLine = screen.getByText("[stderr] error msg");
    expect(stderrLine).toHaveStyle({ color: "var(--error)" });
    const normalLine = screen.getByText("normal line");
    expect(normalLine).not.toHaveStyle({ color: "var(--error)" });
  });

  it("does not show exit code while still running", () => {
    useScriptStore.setState({
      running: { "ws-1:run": true },
      exitCodes: { "ws-1:run": 1 },
    });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.queryByText("Exit: 1")).not.toBeInTheDocument();
  });

  it("shows non-zero exit code with error styling", () => {
    useScriptStore.setState({ exitCodes: { "ws-1:run": 1 } });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    const exitText = screen.getByText("Exit: 1");
    expect(exitText).toHaveStyle({ color: "var(--error)" });
  });

  it("shows zero exit code with success styling", () => {
    useScriptStore.setState({ exitCodes: { "ws-1:run": 0 } });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    const exitText = screen.getByText("Exit: 0");
    expect(exitText).toHaveStyle({ color: "var(--success)" });
  });

  it("shows 'Stopped' with muted styling when user stopped the script", () => {
    useScriptStore.setState({
      exitCodes: { "ws-1:run": 1 },
      userStopped: { "ws-1:run": true },
    });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    const stoppedText = screen.getByText("Stopped");
    expect(stoppedText).toHaveStyle({ color: "var(--text-muted)" });
    expect(screen.queryByText("Exit: 1")).not.toBeInTheDocument();
  });

  it("shows success styling for exit code 0 even when userStopped is true", () => {
    useScriptStore.setState({
      exitCodes: { "ws-1:run": 0 },
      userStopped: { "ws-1:run": true },
    });
    render(<RunPanel context={{ id: "ws-1", type: "workspace" }} />);
    const exitText = screen.getByText("Exit: 0");
    expect(exitText).toHaveStyle({ color: "var(--success)" });
  });
});
