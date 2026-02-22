import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetupPanel } from "./SetupPanel";
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
});
