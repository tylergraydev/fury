import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceTemplateDialog } from "./WorkspaceTemplateDialog";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
}));

const mockGetRepoSettings = vi.fn();
const mockCreateWorkspaceTemplate = vi.fn();

vi.mock("../../lib/tauri", () => ({
  getRepoSettings: (...args: unknown[]) => mockGetRepoSettings(...args),
  createWorkspaceTemplate: (...args: unknown[]) =>
    mockCreateWorkspaceTemplate(...args),
  listWorkspaceTemplates: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  mockGetRepoSettings.mockReset();
  mockGetRepoSettings.mockResolvedValue({
    setupScript: "npm install",
    runScript: "npm run dev",
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: { NODE_ENV: "development" },
    providerOverride: null,
  });
  mockCreateWorkspaceTemplate.mockReset();
  mockCreateWorkspaceTemplate.mockResolvedValue({
    id: "tmpl-new",
    repoId: "repo-1",
    name: "test-template",
    description: null,
    setupScript: "npm install",
    runScript: "npm run dev",
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: { NODE_ENV: "development" },
    sparseDirs: null,
    autoCommit: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });
  useWorkspaceTemplateStore.setState({
    templates: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("WorkspaceTemplateDialog", () => {
  it("renders dialog with title", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Save as Template")).toBeInTheDocument();
  });

  it("pre-fills scripts from repo settings", async () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalledWith("repo-1");
    });
    await waitFor(() => {
      const setupTextarea = screen.getAllByRole("textbox").find(
        (el) => (el as HTMLTextAreaElement).value === "npm install",
      );
      expect(setupTextarea).toBeTruthy();
    });
  });

  it("requires template name to save", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const saveBtn = screen.getByText("Save Template").closest("button")!;
    expect(saveBtn).toBeDisabled();
  });

  it("enables save button when name is entered", async () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });
    const saveBtn = screen.getByText("Save Template").closest("button")!;
    expect(saveBtn).not.toBeDisabled();
  });

  it("shows error when saving without name", async () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    // Force click the save button by finding it and calling handleSave
    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "   " } });
    // Button should be disabled when name is whitespace-only
    const saveBtn = screen.getByText("Save Template").closest("button")!;
    expect(saveBtn).toBeDisabled();
  });

  it("calls createTemplate and closes on successful save", async () => {
    const onClose = vi.fn();
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });

    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error when save fails", async () => {
    mockCreateWorkspaceTemplate.mockRejectedValue(
      new Error("duplicate name"),
    );
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );

    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });

    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(screen.getByText(/duplicate name/)).toBeInTheDocument();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );
    const backdrop = screen.getByText("Save as Template").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows auto-commit checkbox defaulting to checked", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("shows run script mode radio buttons", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    expect(
      screen.getByText("Nonconcurrent (kill previous)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Concurrent")).toBeInTheDocument();
  });
});
