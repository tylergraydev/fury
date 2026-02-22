import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectDialog } from "./NewProjectDialog";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkle-icon" />,
  X: () => <span data-testid="x-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  initRepository: vi.fn().mockResolvedValue({ id: "r1", name: "test" }),
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  useRepositoryStore.setState({ repositories: [] });
  useWorkspaceStore.setState({ workspaces: [], activeRepoId: null });
  vi.clearAllMocks();
});

describe("NewProjectDialog", () => {
  it("renders the dialog with title", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.getByText("New AI Project")).toBeInTheDocument();
  });

  it("shows Project Name input", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("my-awesome-project")).toBeInTheDocument();
  });

  it("has Cancel and Create Project buttons", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("Create button is disabled when name is empty", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.getByText("Create Project").closest("button")).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Browse button", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.getByText("Browse")).toBeInTheDocument();
  });
});
