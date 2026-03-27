import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewProjectDialog } from "./NewProjectDialog";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkle-icon" />,
  X: () => <span data-testid="x-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
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

vi.mock("../../lib/tauri", () => ({
  initRepository: vi.fn().mockResolvedValue({ id: "r1", name: "test" }),
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
}));

const mockInitRepo = vi.fn();
const mockSetActiveRepo = vi.fn();

beforeEach(() => {
  mockInitRepo.mockReset();
  mockInitRepo.mockResolvedValue({ id: "r1", name: "test-project", path: "/home/user/Code/test-project", defaultBranch: "main", currentBranch: "main" });
  mockSetActiveRepo.mockReset();

  useRepositoryStore.setState({
    repositories: [],
    initRepo: mockInitRepo,
  } as any);
  useWorkspaceStore.setState({
    workspaces: [],
    activeRepoId: null,
    setActiveRepo: mockSetActiveRepo,
  } as any);
  vi.clearAllMocks();
  (homeDir as ReturnType<typeof vi.fn>).mockResolvedValue("/home/user/");
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

  // --- New tests for full coverage ---

  it("loads homeDir on mount and sets basePath", async () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(homeDir).toHaveBeenCalled();
    });
    await waitFor(() => {
      const locationInput = screen.getByPlaceholderText("~/Code");
      expect(locationInput).toHaveValue("/home/user/Code");
    });
  });

  it("shows derived slug path when project name is entered", async () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "My Cool Project" } });

    expect(screen.getByText("Will create: /home/user/Code/my-cool-project")).toBeInTheDocument();
  });

  it("converts name to kebab-case slug", async () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "Hello World! @#$ Test" } });

    expect(screen.getByText("Will create: /home/user/Code/hello-world-test")).toBeInTheDocument();
  });

  it("enables Create button when name is provided", async () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "test" } });
    expect(screen.getByText("Create Project").closest("button")).not.toBeDisabled();
  });

  it("updates basePath when typing in location input", async () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    const locationInput = screen.getByPlaceholderText("~/Code");
    fireEvent.change(locationInput, { target: { value: "/custom/location" } });
    expect(locationInput).toHaveValue("/custom/location");
  });

  it("opens file dialog and sets basePath when Browse is clicked", async () => {
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/selected/path");
    render(<NewProjectDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Browse"));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select Project Location",
      });
    });
    await waitFor(() => {
      const locationInput = screen.getByPlaceholderText("~/Code");
      expect(locationInput).toHaveValue("/selected/path");
    });
  });

  it("does not change basePath if Browse dialog is cancelled", async () => {
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });
    fireEvent.click(screen.getByText("Browse"));
    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
  });

  it("calls initRepo and setActiveRepo then onClose on success", async () => {
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "Test Project" } });

    fireEvent.click(screen.getByText("Create Project"));

    await waitFor(() => {
      expect(mockInitRepo).toHaveBeenCalledWith("/home/user/Code/test-project", "Test Project");
    });
    await waitFor(() => {
      expect(mockSetActiveRepo).toHaveBeenCalledWith("r1");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows loading state while creating", async () => {
    let resolveCreate: (value: any) => void;
    mockInitRepo.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByText("Create Project"));

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });
    expect(screen.getByText("Creating...").closest("button")).toBeDisabled();

    resolveCreate!({ id: "r1", name: "test" });
  });

  it("shows error when create fails", async () => {
    mockInitRepo.mockRejectedValueOnce(new Error("Init failed"));

    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByText("Create Project"));

    await waitFor(() => {
      expect(screen.getByText(/Init failed/)).toBeInTheDocument();
    });
    // Button should no longer show "Creating..."
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("does not call initRepo when name is empty", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    const createBtn = screen.getByText("Create Project").closest("button")!;
    expect(createBtn).toBeDisabled();
    expect(mockInitRepo).not.toHaveBeenCalled();
  });

  it("does not call initRepo when name is set but basePath is empty (early return guard)", async () => {
    // Make homeDir never resolve so basePath stays empty
    (homeDir as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<NewProjectDialog onClose={vi.fn()} />);

    // Set name - this enables the button since disabled only checks !name.trim()
    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "test" } });

    // Clear the basePath to ensure fullPath is empty
    const locationInput = screen.getByPlaceholderText("~/Code");
    fireEvent.change(locationInput, { target: { value: "" } });

    // Button is enabled (name is set, creating is false)
    const createBtn = screen.getByText("Create Project").closest("button")!;
    expect(createBtn).not.toBeDisabled();

    // Click: handleCreate runs, but early returns because !fullPath
    fireEvent.click(createBtn);

    expect(mockInitRepo).not.toHaveBeenCalled();
  });

  it("calls onClose when clicking backdrop overlay", () => {
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    const backdrop = screen.getByText("New AI Project").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside dialog content", () => {
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("New AI Project"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not show 'Will create' text when name is empty", () => {
    render(<NewProjectDialog onClose={vi.fn()} />);
    expect(screen.queryByText(/Will create:/)).not.toBeInTheDocument();
  });

  it("resets creating state after error", async () => {
    mockInitRepo.mockRejectedValueOnce(new Error("Oops"));

    render(<NewProjectDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("~/Code")).toHaveValue("/home/user/Code");
    });

    const nameInput = screen.getByPlaceholderText("my-awesome-project");
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByText("Create Project"));

    await waitFor(() => {
      expect(screen.getByText(/Oops/)).toBeInTheDocument();
    });
    expect(screen.getByText("Create Project")).toBeInTheDocument();
    expect(screen.getByText("Create Project").closest("button")).not.toBeDisabled();
  });
});
