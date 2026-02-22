import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecksPanel } from "./ChecksPanel";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTodoStore } from "../../stores/todoStore";

vi.mock("lucide-react", () => ({
  ExternalLink: () => <span data-testid="link-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  loadPrInfo: vi.fn().mockResolvedValue(null),
  createPr: vi.fn().mockResolvedValue(undefined),
  mergePr: vi.fn().mockResolvedValue(undefined),
  pushChanges: vi.fn().mockResolvedValue(undefined),
  refreshChecks: vi.fn().mockResolvedValue(undefined),
  getFixMessage: vi.fn().mockResolvedValue(""),
  listTodos: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  usePrStore.setState({
    prInfo: {},
    loading: {},
    error: {},
    listeners: {},
    polling: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", name: "test-ws", branch: "feature-1", repoId: "r1" },
    ] as any,
  });
  useTodoStore.setState({ todos: {}, loading: {}, error: {} });
  vi.clearAllMocks();
});

describe("ChecksPanel", () => {
  it("shows Create PR form when no PR exists", () => {
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("Create Pull Request")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("PR title")).toBeInTheDocument();
  });

  it("shows PR header when PR exists", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          prNumber: 42,
          title: "My PR",
          state: "OPEN",
          checks: [],
          mergeable: null,
          prUrl: null,
        },
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("My PR")).toBeInTheDocument();
  });

  it("shows checks when they exist", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          prNumber: 1,
          title: "PR",
          state: "OPEN",
          checks: [
            { name: "CI Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null },
            { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null },
          ],
          mergeable: null,
          prUrl: null,
        },
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("CI Build")).toBeInTheDocument();
    expect(screen.getByText("Lint")).toBeInTheDocument();
  });

  it("shows Fix with Claude button when checks fail", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          prNumber: 1,
          title: "PR",
          state: "OPEN",
          checks: [
            { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null },
          ],
          mergeable: null,
          prUrl: null,
        },
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
  });

  it("shows merged state", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          prNumber: 10,
          title: "Merged PR",
          state: "MERGED",
          checks: [],
          mergeable: null,
          prUrl: null,
        },
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("PR #10 Merged")).toBeInTheDocument();
  });

  it("shows Push button when PR exists", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          prNumber: 1,
          title: "PR",
          state: "OPEN",
          checks: [],
          mergeable: null,
          prUrl: null,
        },
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("Push")).toBeInTheDocument();
  });
});
