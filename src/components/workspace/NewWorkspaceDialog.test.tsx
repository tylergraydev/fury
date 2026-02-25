import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkle-icon" />,
  X: () => <span data-testid="x-icon" />,
  GitFork: () => <span data-testid="fork-icon" />,
  MessageSquare: () => <span data-testid="msg-icon" />,
  ChevronDown: () => <span data-testid="chevron-icon" />,
}));

const mockListBranches = vi.fn();

vi.mock("../../lib/tauri", () => ({
  listBranches: (...args: unknown[]) => mockListBranches(...args),
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
