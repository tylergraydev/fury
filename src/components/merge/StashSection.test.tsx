import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StashSection } from "./StashSection";
import { useStashStore } from "../../stores/stashStore";

vi.mock("lucide-react", () => ({
  Archive: () => <span data-testid="archive-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Play: () => <span data-testid="play-icon" />,
  ArrowUpFromLine: () => <span data-testid="pop-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  FileText: () => <span data-testid="file-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  GitCompare: () => <span data-testid="icon-gitcompare" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

}));

const mockListStashes = vi.fn().mockResolvedValue([]);

vi.mock("../../lib/tauri", () => ({
  listStashes: (...args: unknown[]) => mockListStashes(...args),
  createStash: vi.fn().mockResolvedValue(undefined),
  applyStash: vi.fn().mockResolvedValue(undefined),
  popStash: vi.fn().mockResolvedValue(undefined),
  dropStash: vi.fn().mockResolvedValue(undefined),
  showStash: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useStashStore.setState({
    stashes: {},
    selectedStash: {},
    stashDetail: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("StashSection", () => {
  it("renders empty state when no stashes", async () => {
    mockListStashes.mockResolvedValueOnce([]);
    render(<StashSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No stashes")).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    useStashStore.setState({
      loading: { "ws-1": true },
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("Loading stashes...")).toBeInTheDocument();
  });

  it("shows error banner", () => {
    useStashStore.setState({
      error: { "ws-1": "Something went wrong" },
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders stash list", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
          { index: 1, message: "another", branch: "feature", timestamp: "2024-01-14T10:00:00+00:00" },
        ],
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("my stash")).toBeInTheDocument();
    expect(screen.getByText("another")).toBeInTheDocument();
  });

  it("shows Stash Changes button", async () => {
    mockListStashes.mockResolvedValueOnce([]);
    render(<StashSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Stash Changes")).toBeInTheDocument();
    });
  });

  it("shows create form when button clicked", async () => {
    mockListStashes.mockResolvedValueOnce([]);
    render(<StashSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Stash Changes")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Stash Changes"));
    expect(screen.getByPlaceholderText("Stash message (optional)")).toBeInTheDocument();
    expect(screen.getByText("Include untracked files")).toBeInTheDocument();
    expect(screen.getByText("Stash")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("hides create form on cancel", async () => {
    mockListStashes.mockResolvedValueOnce([]);
    render(<StashSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Stash Changes")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Stash Changes"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Stash Changes")).toBeInTheDocument();
  });

  it("calls createStash on form submit", () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    useStashStore.setState({
      createStash: mockCreate,
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Stash Changes"));
    const input = screen.getByPlaceholderText("Stash message (optional)");
    fireEvent.change(input, { target: { value: "test message" } });
    fireEvent.click(screen.getByText("Stash"));
    expect(mockCreate).toHaveBeenCalledWith("ws-1", "test message", false);
  });

  it("calls createStash on Enter key", () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    useStashStore.setState({
      createStash: mockCreate,
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Stash Changes"));
    const input = screen.getByPlaceholderText("Stash message (optional)");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("closes create form on Escape key", () => {
    useStashStore.setState({ stashes: { "ws-1": [] } });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Stash Changes"));
    const input = screen.getByPlaceholderText("Stash message (optional)");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByText("Stash Changes")).toBeInTheDocument();
  });

  it("toggles include untracked checkbox", () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    useStashStore.setState({
      createStash: mockCreate,
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Stash Changes"));
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("Stash"));
    expect(mockCreate).toHaveBeenCalledWith("ws-1", undefined, true);
  });

  it("expands stash to show detail", () => {
    const mockShow = vi.fn().mockResolvedValue(undefined);
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      showStash: mockShow,
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("my stash"));
    expect(mockShow).toHaveBeenCalledWith("ws-1", 0);
  });

  it("shows action buttons when expanded", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": {
          index: 0,
          message: "my stash",
          files: [{ path: "file.ts", additions: 3, deletions: 1 }],
          patch: "",
        },
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("Apply")).toBeInTheDocument();
    expect(screen.getByText("Pop")).toBeInTheDocument();
    expect(screen.getByText("Drop")).toBeInTheDocument();
  });

  it("shows file stats in expanded stash", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": {
          index: 0,
          message: "my stash",
          files: [{ path: "file.ts", additions: 3, deletions: 1 }],
          patch: "",
        },
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("file.ts")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("shows 'No file changes' for empty stash detail", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": {
          index: 0,
          message: "my stash",
          files: [],
          patch: "",
        },
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("No file changes")).toBeInTheDocument();
  });

  it("calls applyStash when Apply is clicked", () => {
    const mockApply = vi.fn();
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": { index: 0, message: "my stash", files: [], patch: "" },
      },
      applyStash: mockApply,
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Apply"));
    expect(mockApply).toHaveBeenCalledWith("ws-1", 0);
  });

  it("calls popStash when Pop is clicked", () => {
    const mockPop = vi.fn();
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": { index: 0, message: "my stash", files: [], patch: "" },
      },
      popStash: mockPop,
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Pop"));
    expect(mockPop).toHaveBeenCalledWith("ws-1", 0);
  });

  it("requires double-click to drop stash", () => {
    const mockDrop = vi.fn();
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: {
        "ws-1": { index: 0, message: "my stash", files: [], patch: "" },
      },
      dropStash: mockDrop,
    });
    render(<StashSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Drop"));
    expect(mockDrop).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm Drop")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm Drop"));
    expect(mockDrop).toHaveBeenCalledWith("ws-1", 0);
  });

  it("shows branch name on stash", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "feature-x", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("on feature-x")).toBeInTheDocument();
  });

  it("shows WIP for stash with empty message", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("WIP")).toBeInTheDocument();
  });

  it("shows Loading... when stash is expanded but detail not yet loaded", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-15T10:00:00+00:00" },
        ],
      },
      selectedStash: { "ws-1": 0 },
      stashDetail: { "ws-1": null },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("formats timestamp as just now", () => {
    const now = new Date().toISOString();
    useStashStore.setState({
      stashes: { "ws-1": [{ index: 0, message: "fresh", branch: "main", timestamp: now }] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("formats timestamp as minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    useStashStore.setState({
      stashes: { "ws-1": [{ index: 0, message: "recent", branch: "main", timestamp: fiveMinAgo }] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });

  it("formats timestamp as hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    useStashStore.setState({
      stashes: { "ws-1": [{ index: 0, message: "old", branch: "main", timestamp: threeHoursAgo }] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("3h ago")).toBeInTheDocument();
  });

  it("formats timestamp as days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    useStashStore.setState({
      stashes: { "ws-1": [{ index: 0, message: "older", branch: "main", timestamp: twoDaysAgo }] },
    });
    render(<StashSection workspaceId="ws-1" />);
    expect(screen.getByText("2d ago")).toBeInTheDocument();
  });

  it("disables Stash Changes button when loading", () => {
    useStashStore.setState({
      loading: { "ws-1": true },
      stashes: { "ws-1": [] },
    });
    render(<StashSection workspaceId="ws-1" />);
    const button = screen.getByText("Stash Changes");
    expect(button).toBeDisabled();
  });
});
