import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceTemplateDialog } from "./WorkspaceTemplateDialog";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
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

  it("renders dialog with correct aria attributes", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Workspace template");
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

  it("handles getRepoSettings rejection gracefully", async () => {
    mockGetRepoSettings.mockRejectedValue(new Error("network error"));
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalledWith("repo-1");
    });
    // Dialog should still render without errors
    expect(screen.getByText("Save as Template")).toBeInTheDocument();
  });

  it("pre-fills with null/undefined script values as empty strings", async () => {
    mockGetRepoSettings.mockResolvedValue({
      setupScript: null,
      runScript: undefined,
      archiveScript: null,
      runScriptMode: "concurrent",
      envVars: {},
    });
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });
    // No crash, dialog renders
    expect(screen.getByText("Save as Template")).toBeInTheDocument();
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

  it("passes correct data to createTemplate with all fields populated", async () => {
    const onClose = vi.fn();
    // Return settings with no pre-filled envVars so we control them
    mockGetRepoSettings.mockResolvedValue({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
    });

    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Fill in name
    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });

    // Fill in description
    const descInput = screen.getByPlaceholderText("Optional description");
    fireEvent.change(descInput, { target: { value: "A test template" } });

    // Fill in setup script
    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "npm ci" } });
    fireEvent.change(textareas[1], { target: { value: "npm start" } });
    fireEvent.change(textareas[2], { target: { value: "npm run clean" } });

    // Fill in sparse dirs
    const sparseDirsInput = screen.getByPlaceholderText(
      "src, tests (comma-separated)",
    );
    fireEvent.change(sparseDirsInput, {
      target: { value: "src, tests, lib" },
    });

    // Switch run script mode to concurrent
    const concurrentRadio = screen.getByLabelText("Concurrent");
    fireEvent.click(concurrentRadio);

    // Uncheck auto-commit
    const autoCommitCheckbox = screen.getByRole("checkbox");
    fireEvent.click(autoCommitCheckbox);

    // Add an env var
    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "API_KEY" } });
    fireEvent.change(valueInput, { target: { value: "secret123" } });
    fireEvent.click(screen.getByText("Add"));

    // Save
    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Verify the store's createTemplate was called via the component
    // The component calls useWorkspaceTemplateStore().createTemplate
    // which internally calls createWorkspaceTemplate from tauri
    expect(mockCreateWorkspaceTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "repo-1",
        name: "my-template",
        description: "A test template",
        setupScript: "npm ci",
        runScript: "npm start",
        archiveScript: "npm run clean",
        runScriptMode: "concurrent",
        autoCommit: false,
        sparseDirs: ["src", "tests", "lib"],
        envVars: { API_KEY: "secret123" },
      }),
    );
  });

  it("passes undefined for empty optional fields", async () => {
    const onClose = vi.fn();
    mockGetRepoSettings.mockResolvedValue({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
    });

    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Only fill in name (required), leave everything else empty
    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "minimal-template" } });

    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(mockCreateWorkspaceTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "repo-1",
        name: "minimal-template",
        description: undefined,
        setupScript: undefined,
        runScript: undefined,
        archiveScript: undefined,
        runScriptMode: "nonconcurrent",
        envVars: undefined,
        sparseDirs: undefined,
        autoCommit: true,
      }),
    );
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

  it("re-enables save button after failed save", async () => {
    mockCreateWorkspaceTemplate.mockRejectedValue(
      new Error("save failed"),
    );
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );

    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });

    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(screen.getByText(/save failed/)).toBeInTheDocument();
    });

    // Button should be re-enabled after error (saving = false in finally)
    const saveBtn = screen.getByText("Save Template").closest("button")!;
    expect(saveBtn).not.toBeDisabled();
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

  it("does not call onClose when inner dialog is clicked", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows auto-commit checkbox defaulting to checked", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("toggles auto-commit checkbox", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
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

  it("switches run script mode to concurrent", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const concurrentRadio = screen.getByLabelText("Concurrent");
    fireEvent.click(concurrentRadio);
    expect(concurrentRadio).toBeChecked();
  });

  it("switches run script mode back to nonconcurrent", () => {
    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );
    const concurrentRadio = screen.getByLabelText("Concurrent");
    const nonconcurrentRadio = screen.getByLabelText(
      "Nonconcurrent (kill previous)",
    );
    fireEvent.click(concurrentRadio);
    expect(concurrentRadio).toBeChecked();
    fireEvent.click(nonconcurrentRadio);
    expect(nonconcurrentRadio).toBeChecked();
  });

  describe("environment variables", () => {
    it("displays pre-filled env vars from repo settings", async () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );
      await waitFor(() => {
        expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
      });
      expect(screen.getByText("development")).toBeInTheDocument();
    });

    it("adds a new environment variable via Add button", async () => {
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
      });

      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });

      const keyInput = screen.getByPlaceholderText("KEY");
      const valueInput = screen.getByPlaceholderText("value");

      fireEvent.change(keyInput, { target: { value: "MY_VAR" } });
      fireEvent.change(valueInput, { target: { value: "my_value" } });
      fireEvent.click(screen.getByText("Add"));

      expect(screen.getByText("MY_VAR")).toBeInTheDocument();
      expect(screen.getByText("my_value")).toBeInTheDocument();
      // Inputs should be cleared after adding
      expect(keyInput).toHaveValue("");
      expect(valueInput).toHaveValue("");
    });

    it("adds env var via Enter key on value input", async () => {
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
      });

      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });

      const keyInput = screen.getByPlaceholderText("KEY");
      const valueInput = screen.getByPlaceholderText("value");

      fireEvent.change(keyInput, { target: { value: "ENTER_VAR" } });
      fireEvent.change(valueInput, { target: { value: "enter_val" } });
      fireEvent.keyDown(valueInput, { key: "Enter" });

      expect(screen.getByText("ENTER_VAR")).toBeInTheDocument();
      expect(screen.getByText("enter_val")).toBeInTheDocument();
    });

    it("does not add env var when key is empty", () => {
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
      });

      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      const valueInput = screen.getByPlaceholderText("value");
      fireEvent.change(valueInput, { target: { value: "some_value" } });
      fireEvent.click(screen.getByText("Add"));

      // No env var should be displayed
      expect(screen.queryByText("some_value")).not.toBeInTheDocument();
    });

    it("does not add env var when key is whitespace only", () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      const keyInput = screen.getByPlaceholderText("KEY");
      fireEvent.change(keyInput, { target: { value: "   " } });
      fireEvent.click(screen.getByText("Add"));

      // Key input should not be cleared (nothing was added)
      expect(keyInput).toHaveValue("   ");
    });

    it("does not add env var via non-Enter key on value input", () => {
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
      });

      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      const keyInput = screen.getByPlaceholderText("KEY");
      const valueInput = screen.getByPlaceholderText("value");

      fireEvent.change(keyInput, { target: { value: "TAB_VAR" } });
      fireEvent.change(valueInput, { target: { value: "tab_val" } });
      fireEvent.keyDown(valueInput, { key: "Tab" });

      // Should not have added the env var
      expect(screen.queryByText("TAB_VAR")).not.toBeInTheDocument();
    });

    it("removes an environment variable", async () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );

      await waitFor(() => {
        expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
      });

      // The X icon button next to the env var (not the header X)
      // There should be multiple x-icon test ids: one for close, one per env var
      const removeButtons = screen.getAllByTestId("x-icon");
      // Find the one inside the env var row (not the header close button)
      // The last x-icon should be in the env var row
      const envVarRemoveBtn = removeButtons[removeButtons.length - 1]
        .closest("button")!;
      fireEvent.click(envVarRemoveBtn);

      expect(screen.queryByText("NODE_ENV")).not.toBeInTheDocument();
    });
  });

  describe("sparse directories", () => {
    it("allows entering sparse checkout directories", () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );
      const sparseDirsInput = screen.getByPlaceholderText(
        "src, tests (comma-separated)",
      );
      fireEvent.change(sparseDirsInput, {
        target: { value: "src, lib" },
      });
      expect(sparseDirsInput).toHaveValue("src, lib");
    });

    it("handles sparse dirs with trailing commas and empty entries", async () => {
      const onClose = vi.fn();
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
      });

      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={onClose} />,
      );

      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });

      const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
      fireEvent.change(nameInput, { target: { value: "sparse-test" } });

      const sparseDirsInput = screen.getByPlaceholderText(
        "src, tests (comma-separated)",
      );
      fireEvent.change(sparseDirsInput, {
        target: { value: "src, , ,tests" },
      });

      fireEvent.click(screen.getByText("Save Template"));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });

      expect(mockCreateWorkspaceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          sparseDirs: ["src", "tests"],
        }),
      );
    });
  });

  describe("description field", () => {
    it("allows entering a description", () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );
      const descInput = screen.getByPlaceholderText("Optional description");
      fireEvent.change(descInput, {
        target: { value: "My description" },
      });
      expect(descInput).toHaveValue("My description");
    });
  });

  describe("script text areas", () => {
    it("allows changing setup, run, and archive scripts", () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );
      const textareas = screen.getAllByPlaceholderText("e.g. npm install");
      expect(textareas).toHaveLength(3);

      fireEvent.change(textareas[0], { target: { value: "yarn install" } });
      fireEvent.change(textareas[1], { target: { value: "yarn dev" } });
      fireEvent.change(textareas[2], { target: { value: "yarn clean" } });

      expect(textareas[0]).toHaveValue("yarn install");
      expect(textareas[1]).toHaveValue("yarn dev");
      expect(textareas[2]).toHaveValue("yarn clean");
    });

    it("renders script labels with capitalized first letter", () => {
      render(
        <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
      );
      expect(screen.getByText("Setup Script")).toBeInTheDocument();
      expect(screen.getByText("Run Script")).toBeInTheDocument();
      expect(screen.getByText("Archive Script")).toBeInTheDocument();
    });
  });

  it("shows Saving... text while save is in progress", async () => {
    // Make createWorkspaceTemplate hang
    let resolveCreate: (value: unknown) => void;
    mockCreateWorkspaceTemplate.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );

    render(
      <WorkspaceTemplateDialog repoId="repo-1" onClose={vi.fn()} />,
    );

    const nameInput = screen.getByPlaceholderText("e.g. frontend-feature");
    fireEvent.change(nameInput, { target: { value: "my-template" } });

    fireEvent.click(screen.getByText("Save Template"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    // The save button should be disabled while saving
    const savingBtn = screen.getByText("Saving...").closest("button")!;
    expect(savingBtn).toBeDisabled();

    // Resolve the promise
    resolveCreate!({
      id: "tmpl-new",
      repoId: "repo-1",
      name: "my-template",
    });
  });
});
