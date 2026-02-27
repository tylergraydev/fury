import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityLogView } from "./ActivityLogView";
import { useActivityLogStore } from "../../stores/activityLogStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

vi.mock("../../lib/tauri", () => ({
  getGitLog: vi.fn().mockResolvedValue([]),
}));

import { getGitLog } from "../../lib/tauri";

beforeEach(() => {
  useActivityLogStore.setState({
    entries: [],
    commitEntries: {},
    activeFilters: new Set(),
  });
  useWorkspaceStore.setState({
    activeWorkspaceId: "ws-1",
    workspaces: [{ id: "ws-1", name: "test-workspace", repoId: "repo-1", branch: "main", status: "Active", createdAt: new Date().toISOString(), pinned: false }] as any[],
  });
});

describe("ActivityLogView", () => {
  it("renders empty state when no entries", () => {
    render(<ActivityLogView />);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByText("No activity yet")).toBeTruthy();
  });

  it("renders activity entries", () => {
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "agent-completed",
          timestamp: Date.now(),
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Agent completed",
          message: "Task finished in test-workspace",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("Agent completed")).toBeTruthy();
    expect(screen.getByText("Task finished in test-workspace")).toBeTruthy();
  });

  it("groups entries by time", () => {
    const now = Date.now();
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "agent-completed",
          timestamp: now,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Recent event",
          message: "just happened",
        },
        {
          id: "2",
          type: "commit",
          timestamp: now - 24 * 60 * 60 * 1000 - 1000,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Old event",
          message: "happened yesterday",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("Just now")).toBeTruthy();
  });

  it("toggles filter bar visibility", () => {
    render(<ActivityLogView />);
    expect(screen.queryByTestId("filter-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("filter-toggle"));
    expect(screen.getByTestId("filter-bar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("filter-toggle"));
    expect(screen.queryByTestId("filter-bar")).toBeNull();
  });

  it("filters entries by category", () => {
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: Date.now(),
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Fix bug",
          message: "committed abc123",
        },
        {
          id: "2",
          type: "agent-completed",
          timestamp: Date.now() - 1000,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Agent completed",
          message: "Task finished",
        },
      ],
    });

    render(<ActivityLogView />);

    // Show filters
    fireEvent.click(screen.getByTestId("filter-toggle"));

    // Click "Commits" filter
    fireEvent.click(screen.getByText("Commits"));

    // Only commit entry should remain
    const entries = screen.getAllByTestId("activity-entry");
    expect(entries).toHaveLength(1);
    expect(screen.getByText("Fix bug")).toBeTruthy();
  });

  it("only shows entries for the active workspace", () => {
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "agent-completed",
          timestamp: Date.now(),
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "WS1 event",
          message: "in ws-1",
        },
        {
          id: "2",
          type: "agent-completed",
          timestamp: Date.now(),
          workspaceId: "ws-2",
          workspaceName: "other-workspace",
          title: "WS2 event",
          message: "in ws-2",
        },
      ],
    });

    render(<ActivityLogView />);
    const entries = screen.getAllByTestId("activity-entry");
    expect(entries).toHaveLength(1);
    expect(screen.getByText("WS1 event")).toBeTruthy();
  });

  it("loads commits on mount", () => {
    render(<ActivityLogView />);
    expect(getGitLog).toHaveBeenCalledWith("ws-1", 50);
  });
});
