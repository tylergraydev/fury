import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";
import { useAgentStore } from "../../stores/agentStore";
import type { Repository, WorkspaceInfo } from "../../lib/tauri";

const mockRepo: Repository = {
  id: "repo-1",
  name: "my-project",
  path: "/home/user/my-project",
  defaultBranch: "main",
  currentBranch: "feature-x",
};

const mockWorkspace: WorkspaceInfo = {
  id: "ws-1",
  repoId: "repo-1",
  name: "fix-bug",
  branch: "fix-bug",
  status: "Active",
  portBase: 3000,
  autoCommit: false,
  createdAt: "2025-01-01T00:00:00Z",
  archivedAt: null,
};

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
});

describe("TopBar", () => {
  it("renders Fury branding when no repo or workspace is selected", () => {
    render(<TopBar activeWs={undefined} activeRepo={undefined} />);
    expect(screen.getByText("Fury")).toBeInTheDocument();
  });

  it("renders repo name and branch when only repo is selected", () => {
    render(<TopBar activeWs={undefined} activeRepo={mockRepo} />);
    expect(screen.getByText("my-project")).toBeInTheDocument();
    expect(screen.getByText("feature-x")).toBeInTheDocument();
  });

  it("renders repo name, default branch, and workspace name", () => {
    render(<TopBar activeWs={mockWorkspace} activeRepo={mockRepo} />);
    expect(screen.getByText("my-project")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/fix-bug")).toBeInTheDocument();
  });

  it("shows idle agent status by default", () => {
    render(<TopBar activeWs={mockWorkspace} activeRepo={mockRepo} />);
    const dot = screen.getByTitle("Agent idle");
    expect(dot).toBeInTheDocument();
  });

  it("shows running agent status", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": {
          workspaceId: "ws-1",
          sessionId: "s1",
          status: "Running",
          startedAt: null,
        },
      },
    });
    render(<TopBar activeWs={mockWorkspace} activeRepo={mockRepo} />);
    const dot = screen.getByTitle("Agent running");
    expect(dot).toBeInTheDocument();
  });

  it("shows error agent status", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": {
          workspaceId: "ws-1",
          sessionId: "s1",
          status: { Error: "something broke" },
          startedAt: null,
        },
      },
    });
    render(<TopBar activeWs={mockWorkspace} activeRepo={mockRepo} />);
    const dot = screen.getByTitle("Agent error");
    expect(dot).toBeInTheDocument();
  });
});
