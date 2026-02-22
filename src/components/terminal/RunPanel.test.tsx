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

beforeEach(() => {
  useScriptStore.setState({
    output: {},
    running: {},
    exitCodes: {},
    listeners: {},
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
});
