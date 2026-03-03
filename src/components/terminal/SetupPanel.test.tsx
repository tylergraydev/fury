import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetupPanel } from "./SetupPanel";
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

describe("SetupPanel", () => {
  it("shows empty state message", () => {
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(
      screen.getByText("No output yet. Click Run Setup to execute the setup script."),
    ).toBeInTheDocument();
  });

  it("shows the Setup Script label", () => {
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Setup Script")).toBeInTheDocument();
  });

  it("shows Run Setup button when not running", () => {
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Run Setup")).toBeInTheDocument();
  });

  it("shows Stop button when running", () => {
    useScriptStore.setState({ running: { "ws-1:setup": true } });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows exit code when finished", () => {
    useScriptStore.setState({ exitCodes: { "ws-1:setup": 1 } });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Exit: 1")).toBeInTheDocument();
  });

  it("clicking Run Setup calls runScript for workspace context", () => {
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Run Setup"));
    expect(mockRunScript).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("clicking Run Setup calls runRepoScript for repo context", () => {
    render(<SetupPanel context={{ id: "repo-1", type: "repo" }} />);
    fireEvent.click(screen.getByText("Run Setup"));
    expect(mockRunRepoScript).toHaveBeenCalledWith("repo-1", "setup");
  });

  it("clicking Stop calls stopScript for workspace context", () => {
    useScriptStore.setState({ running: { "ws-1:setup": true } });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(mockStopScript).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("clicking Stop calls stopRepoScript for repo context", () => {
    useScriptStore.setState({ running: { "repo-1:setup": true } });
    render(<SetupPanel context={{ id: "repo-1", type: "repo" }} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(mockStopRepoScript).toHaveBeenCalledWith("repo-1", "setup");
  });

  it("clicking Clear calls clearOutput", () => {
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(mockClearOutput).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("subscribes on mount and unsubscribes on unmount", async () => {
    const { unmount } = render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith("ws-1", "setup"));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("renders output lines", () => {
    useScriptStore.setState({
      output: { "ws-1:setup": ["setup line 1", "setup line 2"] },
    });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("setup line 1")).toBeInTheDocument();
    expect(screen.getByText("setup line 2")).toBeInTheDocument();
  });

  it("styles stderr lines with error color", () => {
    useScriptStore.setState({
      output: { "ws-1:setup": ["[stderr] err", "normal"] },
    });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("[stderr] err")).toHaveStyle({ color: "var(--error)" });
  });

  it("does not show exit code while running", () => {
    useScriptStore.setState({
      running: { "ws-1:setup": true },
      exitCodes: { "ws-1:setup": 0 },
    });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.queryByText("Exit: 0")).not.toBeInTheDocument();
  });

  it("shows zero exit code with success styling", () => {
    useScriptStore.setState({ exitCodes: { "ws-1:setup": 0 } });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Exit: 0")).toHaveStyle({ color: "var(--success)" });
  });

  it("shows 'Stopped' with muted styling when user stopped the script", () => {
    useScriptStore.setState({
      exitCodes: { "ws-1:setup": 1 },
      userStopped: { "ws-1:setup": true },
    });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    const stoppedText = screen.getByText("Stopped");
    expect(stoppedText).toHaveStyle({ color: "var(--text-muted)" });
    expect(screen.queryByText("Exit: 1")).not.toBeInTheDocument();
  });

  it("shows success styling for exit code 0 even when userStopped is true", () => {
    useScriptStore.setState({
      exitCodes: { "ws-1:setup": 0 },
      userStopped: { "ws-1:setup": true },
    });
    render(<SetupPanel context={{ id: "ws-1", type: "workspace" }} />);
    expect(screen.getByText("Exit: 0")).toHaveStyle({ color: "var(--success)" });
  });
});
