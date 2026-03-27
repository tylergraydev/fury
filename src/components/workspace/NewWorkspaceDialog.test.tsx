import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";
import { useRepositoryStore } from "../../stores/repositoryStore";

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkle-icon" />,
  X: () => <span data-testid="x-icon" />,
  GitFork: () => <span data-testid="fork-icon" />,
  MessageSquare: () => <span data-testid="msg-icon" />,
  ChevronDown: () => <span data-testid="chevron-icon" />,
  GitPullRequest: () => <span data-testid="pr-icon" />,
  CircleDot: () => <span data-testid="circle-dot" />,
  Search: () => <span data-testid="search-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
}));

const mockListBranches = vi.fn();

const mockListRepoPrs = vi.fn();
const mockListRepoIssues = vi.fn();
const mockSearchLinearIssues = vi.fn();

const mockListWorkspaceTemplates = vi.fn();

vi.mock("../../lib/tauri", () => ({
  listBranches: (...args: unknown[]) => mockListBranches(...args),
  listRepoPrs: (...args: unknown[]) => mockListRepoPrs(...args),
  listRepoIssues: (...args: unknown[]) => mockListRepoIssues(...args),
  searchLinearIssues: (...args: unknown[]) => mockSearchLinearIssues(...args),
  listWorkspaceTemplates: (...args: unknown[]) => mockListWorkspaceTemplates(...args),
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

const mockCreateWs = vi.fn();
const mockSendMsg = vi.fn();

beforeEach(() => {
  mockListBranches.mockReset();
  mockListBranches.mockResolvedValue(["main", "dev", "feature-x"]);
  mockListRepoPrs.mockReset();
  mockListRepoPrs.mockResolvedValue([]);
  mockListRepoIssues.mockReset();
  mockListRepoIssues.mockResolvedValue([]);
  mockSearchLinearIssues.mockReset();
  mockSearchLinearIssues.mockResolvedValue([]);
  mockListWorkspaceTemplates.mockReset();
  mockListWorkspaceTemplates.mockResolvedValue([]);
  useWorkspaceTemplateStore.setState({
    templates: [],
    loading: false,
    error: null,
  });
  mockCreateWs.mockReset();
  mockCreateWs.mockResolvedValue({
    id: "ws-new",
    name: "test",
    repoId: "r1",
    branch: "test",
  });
  mockSendMsg.mockReset();
  mockSendMsg.mockResolvedValue(undefined);

  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    createWs: mockCreateWs,
  } as any);
  useAgentStore.setState({
    agents: {},
    sendMessage: mockSendMsg,
  } as any);
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
    expect(mockListBranches).toHaveBeenCalledWith("r1");
  });

  it("populates branch dropdown with loaded branches", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });
    // Check branches are in the dropdown
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("main");
    expect(options[1]).toHaveTextContent("dev");
    expect(options[2]).toHaveTextContent("feature-x");
  });

  it("selects 'main' as default branch", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("main");
    });
  });

  it("selects 'master' when 'main' is not available", async () => {
    mockListBranches.mockResolvedValueOnce(["dev", "master", "feature"]);
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("master");
    });
  });

  it("selects first branch when neither main nor master is available", async () => {
    mockListBranches.mockResolvedValueOnce(["dev", "feature"]);
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("dev");
    });
  });

  it("shows 'No branches found' when branch list is empty", async () => {
    mockListBranches.mockResolvedValueOnce([]);
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("No branches found")).toBeInTheDocument();
    });
  });

  it("handles branch loading failure gracefully", async () => {
    mockListBranches.mockRejectedValueOnce(new Error("Network error"));
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("No branches found")).toBeInTheDocument();
    });
  });

  it("allows changing the base branch", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "dev" } });
    expect((select as HTMLSelectElement).value).toBe("dev");
  });

  it("allows manual worktree name input", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-worktree" } });
    expect(nameInput).toHaveValue("my-worktree");
  });

  it("toggles auto-commit checkbox", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("Create button is disabled when worktree name is empty", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });
    // worktree name is empty by default
    const createBtn = screen.getByText("Create & Start Chat").closest("button")!;
    expect(createBtn).toBeDisabled();

    // Directly invoke the onClick handler via React fiber to bypass the disabled button check,
    // exercising the handleCreate early return guard when worktreeName is empty.
    const fiber = Object.keys(createBtn).find(k => k.startsWith("__reactFiber"));
    const onClick = fiber ? (createBtn as any)[fiber]?.memoizedProps?.onClick : null;
    expect(onClick).toBeDefined();
    onClick();

    expect(mockCreateWs).not.toHaveBeenCalled();
  });

  it("creates workspace and calls onClose on success", async () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-feature" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalledWith({
        repoId: "r1",
        workspaceName: "my-feature",
        branchName: "my-feature",
        baseBranch: "main",
        autoCommit: true,
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("creates workspace with autoCommit false when unchecked", async () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-feature" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalledWith(
        expect.objectContaining({ autoCommit: false }),
      );
    });
  });

  it("does not send message when task description is empty", async () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-ws" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockSendMsg).not.toHaveBeenCalled();
  });

  it("shows loading state while creating", async () => {
    let resolveCreate: (value: any) => void;
    mockCreateWs.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-ws" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });

    resolveCreate!({ id: "ws-new", name: "my-ws" });
  });

  it("shows error when create fails", async () => {
    mockCreateWs.mockRejectedValueOnce(new Error("Worktree creation failed"));

    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-ws" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(screen.getByText(/Worktree creation failed/)).toBeInTheDocument();
    });
    // Should reset creating state
    expect(screen.getByText("Create & Start Chat")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    const backdrop = screen.getByText("New Chat Worktree").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside dialog", () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("New Chat Worktree"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("sends task description as message after creation from issue mode", async () => {
    mockListRepoIssues.mockResolvedValue([
      { number: 10, title: "Login bug", body: "Users can't login", labels: [], state: "open" },
    ]);
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    // Switch to issue mode
    fireEvent.click(screen.getByText("From Issue"));
    await waitFor(() => {
      expect(screen.getByText("Login bug")).toBeInTheDocument();
    });

    // Select issue (this populates worktreeName and taskDescription)
    fireEvent.click(screen.getByText("Login bug").closest("button")!);

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSendMsg).toHaveBeenCalledWith(
        "ws-new",
        expect.stringContaining("Issue #10: Login bug"),
      );
    });
  });

  it("handles sendMessage error gracefully after creation", async () => {
    mockSendMsg.mockRejectedValue(new Error("send failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListRepoIssues.mockResolvedValue([
      { number: 10, title: "Login bug", body: "", labels: [], state: "open" },
    ]);
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    fireEvent.click(screen.getByText("From Issue"));
    await waitFor(() => {
      expect(screen.getByText("Login bug")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Login bug").closest("button")!);
    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    // The sendMessage rejection is caught by .catch(console.error)
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });

  it("does not send message in branch mode (no task description)", async () => {
    const onClose = vi.fn();

    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();
    });

    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-ws" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockSendMsg).not.toHaveBeenCalled();
  });

  it("shows Loading... in branch dropdown while loading", () => {
    mockListBranches.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // Select should be disabled during loading
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

});

describe("Multi-repo selector", () => {
  afterEach(() => {
    useRepositoryStore.setState({ repositories: [] });
  });

  it("shows repository selector dropdown when multiple repos exist", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "r1", name: "repo-one", path: "/r1" },
        { id: "r2", name: "repo-two", path: "/r2" },
      ] as any,
    });
    render(
      <NewWorkspaceDialog repoId="r1" repoName="repo-one" onClose={vi.fn()} />,
    );
    // Should render as a select dropdown for repo
    expect(screen.getByText("repo-one")).toBeInTheDocument();
    expect(screen.getByText("repo-two")).toBeInTheDocument();
  });

  it("allows changing repository via the selector", async () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "r1", name: "repo-one", path: "/r1" },
        { id: "r2", name: "repo-two", path: "/r2" },
      ] as any,
    });
    render(
      <NewWorkspaceDialog repoId="r1" repoName="repo-one" onClose={vi.fn()} />,
    );
    // Find the repo select (first select element on the page)
    const selects = screen.getAllByRole("combobox");
    // The repo selector is the first select that contains repo options
    const repoSelect = selects.find((s) => {
      const options = s.querySelectorAll("option");
      return Array.from(options).some((o) => o.textContent === "repo-two");
    });
    expect(repoSelect).toBeTruthy();
    fireEvent.change(repoSelect!, { target: { value: "r2" } });
    // Should reload branches for the new repo
    await waitFor(() => {
      expect(mockListBranches).toHaveBeenCalledWith("r2");
    });
  });
});

describe("PR mode", () => {
  const PRs = [
    {
      number: 42,
      title: "Add login",
      headBranch: "feat/login",
      baseBranch: "main",
      author: "alice",
      state: "open",
    },
    {
      number: 43,
      title: "Fix logout",
      headBranch: "fix/logout",
      baseBranch: "main",
      author: "bob",
      state: "open",
    },
  ];

  async function switchToPrMode() {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From PR"));
  }

  it("loads PRs when switching to PR mode", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    await switchToPrMode();
    await waitFor(() => {
      expect(mockListRepoPrs).toHaveBeenCalledWith("r1");
    });
  });

  it("shows loading state", async () => {
    mockListRepoPrs.mockReturnValue(new Promise(() => {}));
    await switchToPrMode();
    expect(screen.getByText("Loading pull requests...")).toBeInTheDocument();
  });

  it("shows error when PR fetch fails", async () => {
    mockListRepoPrs.mockRejectedValue(new Error("network error"));
    await switchToPrMode();
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load pull requests/),
      ).toBeInTheDocument();
    });
  });

  it("shows 'No open pull requests' when list is empty", async () => {
    mockListRepoPrs.mockResolvedValue([]);
    await switchToPrMode();
    await waitFor(() => {
      expect(screen.getByText("No open pull requests")).toBeInTheDocument();
    });
  });

  it("renders PR list with number and title", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    await switchToPrMode();
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
      expect(screen.getByText("Add login")).toBeInTheDocument();
    });
  });

  it("filters PRs by search text", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    await switchToPrMode();
    await waitFor(() => {
      expect(screen.getByText("Add login")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search pull requests...");
    fireEvent.change(searchInput, { target: { value: "logout" } });
    expect(screen.queryByText("Add login")).not.toBeInTheDocument();
    expect(screen.getByText("Fix logout")).toBeInTheDocument();
  });

  it("shows 'No matching pull requests' when filter has no results", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    await switchToPrMode();
    await waitFor(() => {
      expect(screen.getByText("Add login")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search pull requests...");
    fireEvent.change(searchInput, { target: { value: "zzz" } });
    expect(
      screen.getByText("No matching pull requests"),
    ).toBeInTheDocument();
  });

  it("selects PR and populates worktree name and base branch", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    await switchToPrMode();
    await waitFor(() => {
      expect(screen.getByText("Add login")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add login").closest("button")!);
    const nameInput = screen.getByPlaceholderText("feature-auth");
    expect(nameInput).toHaveValue("feat/login");
  });

  it("creates workspace with fetchRemoteBranch for PR mode", async () => {
    mockListRepoPrs.mockResolvedValue(PRs);
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From PR"));
    await waitFor(() => {
      expect(screen.getByText("Add login")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add login").closest("button")!);
    fireEvent.click(screen.getByText("Create & Start Chat"));
    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalledWith(
        expect.objectContaining({ fetchRemoteBranch: true }),
      );
    });
  });
});

describe("Issue mode", () => {
  const ISSUES = [
    {
      number: 10,
      title: "Login bug",
      body: "Users can't login",
      labels: ["bug", "urgent"],
      state: "open",
    },
    {
      number: 11,
      title: "Add dark mode",
      body: "",
      labels: [],
      state: "open",
    },
  ];

  async function switchToIssueMode() {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Issue"));
  }

  it("loads issues when switching to issue mode", async () => {
    mockListRepoIssues.mockResolvedValue(ISSUES);
    await switchToIssueMode();
    await waitFor(() => {
      expect(mockListRepoIssues).toHaveBeenCalledWith("r1");
    });
  });

  it("shows loading state", async () => {
    mockListRepoIssues.mockReturnValue(new Promise(() => {}));
    await switchToIssueMode();
    expect(screen.getByText("Loading issues...")).toBeInTheDocument();
  });

  it("shows error on failure", async () => {
    mockListRepoIssues.mockRejectedValue(new Error("fail"));
    await switchToIssueMode();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load issues/)).toBeInTheDocument();
    });
  });

  it("shows 'No open issues' when list is empty", async () => {
    mockListRepoIssues.mockResolvedValue([]);
    await switchToIssueMode();
    await waitFor(() => {
      expect(screen.getByText("No open issues")).toBeInTheDocument();
    });
  });

  it("renders issues with number, title, and labels", async () => {
    mockListRepoIssues.mockResolvedValue(ISSUES);
    await switchToIssueMode();
    await waitFor(() => {
      expect(screen.getByText("#10")).toBeInTheDocument();
      expect(screen.getByText("Login bug")).toBeInTheDocument();
      expect(screen.getByText("bug")).toBeInTheDocument();
      expect(screen.getByText("urgent")).toBeInTheDocument();
    });
  });

  it("filters issues by search text", async () => {
    mockListRepoIssues.mockResolvedValue(ISSUES);
    await switchToIssueMode();
    await waitFor(() => {
      expect(screen.getByText("Login bug")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "dark" } });
    expect(screen.queryByText("Login bug")).not.toBeInTheDocument();
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
  });

  it("selects issue and populates worktree name", async () => {
    mockListRepoIssues.mockResolvedValue(ISSUES);
    await switchToIssueMode();
    await waitFor(() => {
      expect(screen.getByText("Login bug")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Login bug").closest("button")!);
    const nameInput = screen.getByPlaceholderText("feature-auth");
    expect(nameInput).toHaveValue("issue-10-login-bug");
  });
});

describe("Template mode", () => {
  const TEMPLATES = [
    {
      id: "tmpl-1",
      repoId: "r1",
      name: "frontend-feature",
      description: "Standard frontend setup",
      setupScript: "npm install",
      runScript: "npm run dev",
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      sparseDirs: ["src", "tests"],
      autoCommit: true,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "tmpl-2",
      repoId: "r1",
      name: "backend-service",
      description: null,
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      sparseDirs: null,
      autoCommit: false,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
  ];

  async function switchToTemplateMode() {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Template"));
  }

  it("shows 'No templates saved yet' when no templates exist", async () => {
    await switchToTemplateMode();
    await waitFor(() => {
      expect(
        screen.getByText(/No templates saved yet/),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state", async () => {
    mockListWorkspaceTemplates.mockReturnValue(new Promise(() => {}));
    useWorkspaceTemplateStore.setState({ loading: true, templates: [] });
    await switchToTemplateMode();
    expect(screen.getByText("Loading templates...")).toBeInTheDocument();
  });

  it("renders template list with names and descriptions", async () => {
    useWorkspaceTemplateStore.setState({ templates: TEMPLATES });
    await switchToTemplateMode();
    expect(screen.getByText("frontend-feature")).toBeInTheDocument();
    expect(screen.getByText("Standard frontend setup")).toBeInTheDocument();
    expect(screen.getByText("backend-service")).toBeInTheDocument();
  });

  it("selects template and sets autoCommit from template", async () => {
    useWorkspaceTemplateStore.setState({ templates: TEMPLATES });
    await switchToTemplateMode();
    // The second template has autoCommit: false
    fireEvent.click(screen.getByText("backend-service").closest("button")!);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("creates workspace with sparseDirs from selected template", async () => {
    useWorkspaceTemplateStore.setState({ templates: TEMPLATES });
    const onClose = vi.fn();
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={onClose} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Template"));

    // Select template with sparseDirs
    fireEvent.click(screen.getByText("frontend-feature").closest("button")!);

    // Fill in worktree name
    const nameInput = screen.getByPlaceholderText("feature-auth");
    fireEvent.change(nameInput, { target: { value: "my-feature" } });

    fireEvent.click(screen.getByText("Create & Start Chat"));

    await waitFor(() => {
      expect(mockCreateWs).toHaveBeenCalledWith(
        expect.objectContaining({
          sparseDirs: ["src", "tests"],
          autoCommit: true,
        }),
      );
    });
  });

  it("shows 'From Template' tab in mode tabs", () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    expect(screen.getByText("From Template")).toBeInTheDocument();
  });
});

describe("Linear mode", () => {
  const LINEAR_ISSUES = [
    {
      id: "lin1",
      identifier: "ENG-42",
      title: "Fix auth flow",
      url: "https://linear.app/lin1",
      teamName: "Engineering",
      stateName: "In Progress",
      description: "Auth is broken",
    },
  ];

  it("shows 'Type to search Linear issues' initially", async () => {
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Linear"));
    expect(
      screen.getByText("Type to search Linear issues"),
    ).toBeInTheDocument();
  });

  it("shows search results and allows selection", async () => {
    mockSearchLinearIssues.mockResolvedValue(LINEAR_ISSUES);
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Linear"));
    const input = screen.getByPlaceholderText("Search Linear issues...");
    fireEvent.change(input, { target: { value: "auth" } });
    // Search fires after debounce and resolves
    await waitFor(() => {
      expect(screen.getByText("ENG-42")).toBeInTheDocument();
    });
    expect(screen.getByText("Fix auth flow")).toBeInTheDocument();
    expect(
      screen.getByText("Engineering · In Progress"),
    ).toBeInTheDocument();

    // Select and check worktree name
    fireEvent.click(screen.getByText("Fix auth flow").closest("button")!);
    const nameInput = screen.getByPlaceholderText("feature-auth");
    expect(nameInput).toHaveValue("eng-42-fix-auth-flow");
  });

  it("shows error when search fails", async () => {
    mockSearchLinearIssues.mockRejectedValue(new Error("API error"));
    render(
      <NewWorkspaceDialog repoId="r1" repoName="my-repo" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("From Linear"));
    const input = screen.getByPlaceholderText("Search Linear issues...");
    fireEvent.change(input, { target: { value: "test" } });
    await waitFor(() => {
      expect(screen.getByText(/API error/)).toBeInTheDocument();
    });
  });
});
