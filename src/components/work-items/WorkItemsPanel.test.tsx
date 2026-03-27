import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkItemsPanel } from "./WorkItemsPanel";
import { useWorkItemStore } from "../../stores/workItemStore";
import { usePrStore } from "../../stores/prStore";

// Mock tauri IPC so store actions never fire real commands.
vi.mock("../../lib/tauri", () => ({
  listWorkItems: vi.fn().mockResolvedValue([]),
  getWorkItemDetail: vi.fn().mockResolvedValue(null),
  createWorkItem: vi.fn().mockResolvedValue(undefined),
  updateWorkItemState: vi.fn().mockResolvedValue(undefined),
  linkWorkItemToPr: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_ITEMS = [
  {
    id: 1,
    title: "Fix login bug",
    workItemType: "Bug",
    state: "Active",
    assignedTo: "Dev",
    areaPath: null,
    iterationPath: null,
    parentId: null,
    tags: [],
  },
  {
    id: 2,
    title: "Add dark mode",
    workItemType: "User Story",
    state: "New",
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    parentId: null,
    tags: [],
  },
];

describe("WorkItemsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-populate workItems["ws-1"] as an empty array to avoid selector
    // returning a new [] reference on every render (React 18 useSyncExternalStore
    // requires stable references). Also stub loadWorkItems to a no-op.
    useWorkItemStore.setState({
      workItems: { "ws-1": [] },
      workItemDetail: {},
      activeQuery: {},
      loading: {},
      error: {},
      loadWorkItems: vi.fn().mockResolvedValue(undefined),
    });
    usePrStore.setState({
      prInfo: {},
    });
  });

  it("renders loading state", () => {
    useWorkItemStore.setState({ loading: { "ws-1": true } });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("No work items found")).toBeInTheDocument();
  });

  it("renders work items with type badges", () => {
    useWorkItemStore.setState({ workItems: { "ws-1": MOCK_ITEMS } });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("User Story")).toBeInTheDocument();
  });

  it("renders error state", () => {
    useWorkItemStore.setState({ error: { "ws-1": "PAT not configured" } });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("PAT not configured")).toBeInTheDocument();
  });

  it("shows query tabs", () => {
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Assigned to Me")).toBeInTheDocument();
    expect(screen.getByText("Linked to PR")).toBeInTheDocument();
    expect(screen.getByText("This Iteration")).toBeInTheDocument();
  });

  it("shows count in header", () => {
    useWorkItemStore.setState({ workItems: { "ws-1": MOCK_ITEMS } });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Work Items (2)")).toBeInTheDocument();
  });
});
