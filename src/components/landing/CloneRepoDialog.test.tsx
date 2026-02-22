import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";

vi.mock("lucide-react", () => ({
  GitPullRequestArrow: () => <span data-testid="git-icon" />,
  X: () => <span data-testid="x-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  cloneRepository: vi.fn().mockResolvedValue({ id: "r1", name: "repo", path: "/p", defaultBranch: "main", currentBranch: "main" }),
  listRepositories: vi.fn().mockResolvedValue([]),
}));

const mockCloneRepo = vi.fn();

beforeEach(() => {
  mockCloneRepo.mockReset();
  mockCloneRepo.mockResolvedValue({ id: "r1", name: "repo", path: "/p", defaultBranch: "main", currentBranch: "main" });
  useRepositoryStore.setState({
    repositories: [],
    cloneRepo: mockCloneRepo,
  } as any);
  vi.clearAllMocks();
});

describe("CloneRepoDialog", () => {
  it("renders the dialog with title", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    expect(screen.getByText("Clone Repository")).toBeInTheDocument();
  });

  it("shows Repository URL input", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("https://github.com/user/repo.git")).toBeInTheDocument();
  });

  it("has Cancel and Clone buttons", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Clone")).toBeInTheDocument();
  });

  it("Clone button is disabled when URL is empty", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    expect(screen.getByText("Clone").closest("button")).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("has Browse button", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    expect(screen.getByText("Browse")).toBeInTheDocument();
  });

  // --- New tests for full coverage ---

  it("derives repo name from URL in the placeholder", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/my-project.git" } });
    // The path placeholder should update to include the derived name
    expect(screen.getByPlaceholderText("~/Code/my-project")).toBeInTheDocument();
  });

  it("derives 'repo' when URL has no meaningful last segment", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "" } });
    // When URL is empty, derivedName falls back to "repo"
    expect(screen.getByPlaceholderText("~/Code/repo")).toBeInTheDocument();
  });

  it("enables Clone button when URL is provided", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/repo.git" } });
    expect(screen.getByText("Clone").closest("button")).not.toBeDisabled();
  });

  it("updates path when typing in the path input", () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);
    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    fireEvent.change(pathInput, { target: { value: "/custom/path" } });
    expect(pathInput).toHaveValue("/custom/path");
  });

  it("opens file dialog and sets path when Browse is clicked", async () => {
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/selected/dir");
    render(<CloneRepoDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Browse"));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select Clone Destination",
      });
    });
    await waitFor(() => {
      const pathInput = screen.getByPlaceholderText("~/Code/repo");
      expect(pathInput).toHaveValue("/selected/dir");
    });
  });

  it("does not change path if Browse dialog is cancelled (returns null)", async () => {
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    render(<CloneRepoDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Browse"));
    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    expect(pathInput).toHaveValue("");
  });

  it("calls cloneRepo and onClose on successful clone with custom path", async () => {
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);

    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/repo.git" } });

    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    fireEvent.change(pathInput, { target: { value: "/my/custom/path" } });

    fireEvent.click(screen.getByText("Clone"));

    await waitFor(() => {
      expect(mockCloneRepo).toHaveBeenCalledWith("https://github.com/user/repo.git", "/my/custom/path");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("uses default path from homeDir when path is empty", async () => {
    (homeDir as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/home/user/");
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);

    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/myrepo.git" } });

    // Leave path empty
    fireEvent.click(screen.getByText("Clone"));

    await waitFor(() => {
      expect(mockCloneRepo).toHaveBeenCalledWith("https://github.com/user/myrepo.git", "/home/user/Code/myrepo");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows loading state while cloning", async () => {
    let resolveClone: (value: any) => void;
    mockCloneRepo.mockReturnValue(new Promise((resolve) => { resolveClone = resolve; }));

    render(<CloneRepoDialog onClose={vi.fn()} />);

    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/repo.git" } });

    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    fireEvent.change(pathInput, { target: { value: "/some/path" } });

    fireEvent.click(screen.getByText("Clone"));

    await waitFor(() => {
      expect(screen.getByText("Cloning...")).toBeInTheDocument();
    });

    // Clone button should be disabled during cloning
    expect(screen.getByText("Cloning...").closest("button")).toBeDisabled();

    // Resolve clone
    resolveClone!({ id: "r1" });
  });

  it("shows error when clone fails", async () => {
    mockCloneRepo.mockRejectedValueOnce(new Error("Network error"));

    render(<CloneRepoDialog onClose={vi.fn()} />);

    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/repo.git" } });
    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    fireEvent.change(pathInput, { target: { value: "/some/path" } });

    fireEvent.click(screen.getByText("Clone"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    // Should not be in loading state anymore
    expect(screen.getByText("Clone")).toBeInTheDocument();
  });

  it("does not call cloneRepo when URL is empty and Clone is clicked programmatically", async () => {
    render(<CloneRepoDialog onClose={vi.fn()} />);

    const cloneBtn = screen.getByText("Clone").closest("button")!;
    expect(cloneBtn).toBeDisabled();

    // Directly invoke the onClick handler via React fiber to bypass the disabled button check,
    // exercising the handleClone early return guard when url is empty.
    const fiber = Object.keys(cloneBtn).find(k => k.startsWith("__reactFiber"));
    const onClick = fiber ? (cloneBtn as any)[fiber]?.memoizedProps?.onClick : null;
    expect(onClick).toBeDefined();
    onClick();

    // The early return should prevent cloneRepo from being called
    expect(mockCloneRepo).not.toHaveBeenCalled();
  });

  it("calls onClose when clicking the backdrop overlay", () => {
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);

    // The backdrop is the outermost fixed div
    const backdrop = screen.getByText("Clone Repository").closest(".fixed")!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);

    // Click inside the dialog content, not the backdrop
    fireEvent.click(screen.getByText("Clone Repository"));

    // onClose should not be called (only Cancel/X/backdrop triggers it)
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<CloneRepoDialog onClose={onClose} />);

    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("resets cloning state after error", async () => {
    mockCloneRepo.mockRejectedValueOnce(new Error("Fail"));

    render(<CloneRepoDialog onClose={vi.fn()} />);

    const urlInput = screen.getByPlaceholderText("https://github.com/user/repo.git");
    fireEvent.change(urlInput, { target: { value: "https://github.com/user/repo.git" } });
    const pathInput = screen.getByPlaceholderText("~/Code/repo");
    fireEvent.change(pathInput, { target: { value: "/path" } });

    fireEvent.click(screen.getByText("Clone"));

    await waitFor(() => {
      expect(screen.getByText(/Fail/)).toBeInTheDocument();
    });

    // Button should show "Clone" again, not "Cloning..."
    expect(screen.getByText("Clone")).toBeInTheDocument();
    expect(screen.getByText("Clone").closest("button")).not.toBeDisabled();
  });
});
