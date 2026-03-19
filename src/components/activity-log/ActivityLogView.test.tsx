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

  it("deactivates category filter when all types are already active", () => {
    // Set up with commit filter already active
    useActivityLogStore.setState({
      activeFilters: new Set(["commit"] as any),
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
          title: "Agent done",
          message: "Task finished",
        },
      ],
    });

    render(<ActivityLogView />);
    fireEvent.click(screen.getByTestId("filter-toggle"));

    // Click Commits (already active) to deactivate it
    fireEvent.click(screen.getByText("Commits"));

    // Now no filters active, both entries should show
    const entries = screen.getAllByTestId("activity-entry");
    expect(entries).toHaveLength(2);
  });

  it("shows Clear button when filters are active and clears on click", () => {
    useActivityLogStore.setState({
      activeFilters: new Set(["commit"] as any),
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
      ],
    });

    render(<ActivityLogView />);
    fireEvent.click(screen.getByTestId("filter-toggle"));
    expect(screen.getByText("Clear")).toBeTruthy();

    fireEvent.click(screen.getByText("Clear"));
    // After clearing, all entries visible (no filters)
    expect(screen.getAllByTestId("activity-entry")).toHaveLength(1);
  });

  it("does not load commits when no active workspace", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    vi.mocked(getGitLog).mockClear();

    render(<ActivityLogView />);
    expect(getGitLog).not.toHaveBeenCalled();
  });

  it("refresh button does nothing when no active workspace", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    vi.mocked(getGitLog).mockClear();

    render(<ActivityLogView />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    expect(getGitLog).not.toHaveBeenCalled();
  });

  it("refresh button reloads commits when workspace is active", () => {
    vi.mocked(getGitLog).mockClear();

    render(<ActivityLogView />);
    // loadCommits was called on mount; clear and click refresh
    vi.mocked(getGitLog).mockClear();
    fireEvent.click(screen.getByTestId("refresh-button"));
    expect(getGitLog).toHaveBeenCalledWith("ws-1", 50);
  });

  it("relativeTime shows hours for entries several hours old", () => {
    const hoursAgo = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: hoursAgo,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Hours ago event",
          message: "happened hours ago",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("3h ago")).toBeTruthy();
  });

  it("relativeTime shows minutes for entries minutes old", () => {
    const minutesAgo = Date.now() - 15 * 60 * 1000; // 15 minutes ago
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: minutesAgo,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Minutes ago event",
          message: "happened minutes ago",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("15m ago")).toBeTruthy();
  });

  it("relativeTime shows days for entries days old", () => {
    const daysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: daysAgo,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Days ago event",
          message: "happened days ago",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("5d ago")).toBeTruthy();
  });

  it("toggleCategory activates only missing types in a partially active category", () => {
    // Set up with only one of the two agent types active
    useActivityLogStore.setState({
      activeFilters: new Set(["agent-started"] as any),
      entries: [
        {
          id: "1",
          type: "agent-started",
          timestamp: Date.now(),
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Agent started",
          message: "started",
        },
        {
          id: "2",
          type: "agent-completed",
          timestamp: Date.now() - 1000,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Agent completed",
          message: "completed",
        },
      ],
    });

    render(<ActivityLogView />);
    fireEvent.click(screen.getByTestId("filter-toggle"));

    // Click Agent category - agent-started is already active, agent-completed is not
    // So it should activate agent-completed too (not toggle agent-started off)
    fireEvent.click(screen.getByText("Agent"));

    // Both agent entries should be visible
    const entries = screen.getAllByTestId("activity-entry");
    expect(entries).toHaveLength(2);
  });

  it("displays entries grouped under Yesterday label", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterdayTs = today.getTime() - 1000; // 1 second before midnight = yesterday

    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: yesterdayTs,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Yesterday event",
          message: "happened yesterday",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("Yesterday")).toBeTruthy();
  });

  it("displays entries grouped under Earlier label", () => {
    const oldTs = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago

    useActivityLogStore.setState({
      entries: [
        {
          id: "1",
          type: "commit",
          timestamp: oldTs,
          workspaceId: "ws-1",
          workspaceName: "test-workspace",
          title: "Old event",
          message: "happened long ago",
        },
      ],
    });

    render(<ActivityLogView />);
    expect(screen.getByText("Earlier")).toBeTruthy();
  });

  it("displays Today group for entries after midnight but not recent", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 10 minutes after midnight today (not within 5 min of now unless test runs exactly then)
    const todayTs = today.getTime() + 10 * 60 * 1000;

    // Only use this if it's not within 5 min of now (otherwise it's "Just now")
    if (Date.now() - todayTs > 5 * 60 * 1000) {
      useActivityLogStore.setState({
        entries: [
          {
            id: "1",
            type: "commit",
            timestamp: todayTs,
            workspaceId: "ws-1",
            workspaceName: "test-workspace",
            title: "Today event",
            message: "happened today",
          },
        ],
      });

      render(<ActivityLogView />);
      expect(screen.getByText("Today")).toBeTruthy();
    }
  });
});
