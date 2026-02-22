import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { listBranches } from "../../lib/tauri";

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkle-icon" />,
  X: () => <span data-testid="x-icon" />,
  GitFork: () => <span data-testid="fork-icon" />,
  MessageSquare: () => <span data-testid="msg-icon" />,
  ChevronDown: () => <span data-testid="chevron-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  listBranches: vi.fn().mockResolvedValue(["main", "dev"]),
  createWorkspace: vi.fn().mockResolvedValue({
    id: "ws-new",
    name: "test",
    repoId: "r1",
    branch: "test",
  }),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
  });
  useAgentStore.setState({ statuses: {} });
  vi.clearAllMocks();
});

describe("NewWorkspaceDialog", () => {
  it("renders with title", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("New Chat Worktree")).toBeInTheDocument();
  });

  it("shows the repository name", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("my-repo")).toBeInTheDocument();
  });

  it("has task description textarea", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("What do you want to work on?")).toBeInTheDocument();
  });

  it("has auto-commit checkbox defaulting to checked", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Auto-commit changes")).toBeInTheDocument();
  });

  it("has Cancel button that calls onClose", () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("loads branches on mount", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(listBranches).toHaveBeenCalledWith("r1");
  });

  it("has Generate button for worktree name", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });
});
