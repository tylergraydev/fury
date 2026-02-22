import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { useRepositoryStore } from "../../stores/repositoryStore";

vi.mock("lucide-react", () => ({
  GitPullRequestArrow: () => <span data-testid="git-icon" />,
  X: () => <span data-testid="x-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  cloneRepository: vi.fn().mockResolvedValue(undefined),
  listRepositories: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  useRepositoryStore.setState({ repositories: [] });
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
});
