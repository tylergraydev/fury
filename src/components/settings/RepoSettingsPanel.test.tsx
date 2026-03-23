import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RepoSettingsPanel } from "./RepoSettingsPanel";

const mockGetRepoSettings = vi.fn().mockResolvedValue({
  setupScript: null,
  runScript: null,
  archiveScript: null,
  runScriptMode: "nonconcurrent",
  envVars: {},
  worktreeBasePath: null,
  providerOverride: null,
  devcontainer: null,
});
const mockUpdateRepoSettings = vi.fn().mockResolvedValue(undefined);
const mockDetectDevcontainer = vi.fn().mockResolvedValue(null);

vi.mock("../../lib/tauri", () => ({
  getRepoSettings: (...args: unknown[]) => mockGetRepoSettings(...args),
  updateRepoSettings: (...args: unknown[]) => mockUpdateRepoSettings(...args),
  detectDevcontainer: (...args: unknown[]) => mockDetectDevcontainer(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../devcontainer/ContainerizePanel", () => ({
  default: ({ workspaceId, existingDevcontainer }: { workspaceId: string; existingDevcontainer?: string | null; onContainerized?: () => void }) => (
    <div data-testid="containerize-panel" data-workspace-id={workspaceId} data-existing={existingDevcontainer ?? ""}>
      ContainerizePanel
    </div>
  ),
}));

const mockLoadTemplates = vi.fn().mockResolvedValue(undefined);
const mockDeleteTemplate = vi.fn().mockResolvedValue(undefined);

vi.mock("../../stores/workspaceTemplateStore", () => ({
  useWorkspaceTemplateStore: vi.fn(() => ({
    templates: [],
    loadTemplates: mockLoadTemplates,
    deleteTemplate: mockDeleteTemplate,
  })),
}));

vi.mock("../workspace/WorkspaceTemplateDialog", () => ({
  WorkspaceTemplateDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="workspace-template-dialog">
      <button onClick={onClose}>Close Template Dialog</button>
    </div>
  ),
}));

// Re-import so we can change the mock return value per test
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";
const mockedUseWorkspaceTemplateStore = vi.mocked(useWorkspaceTemplateStore);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoSettings.mockResolvedValue({
    setupScript: null,
    runScript: null,
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: {},
    worktreeBasePath: null,
    providerOverride: null,
    devcontainer: null,
  });
  mockDetectDevcontainer.mockResolvedValue(null);
  mockedUseWorkspaceTemplateStore.mockReturnValue({
    templates: [],
    loadTemplates: mockLoadTemplates,
    deleteTemplate: mockDeleteTemplate,
  } as ReturnType<typeof useWorkspaceTemplateStore>);
});

describe("RepoSettingsPanel", () => {
  it("renders dialog with repo name in header", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Settings: My Repo" })).toBeInTheDocument();
  });

  it("shows script fields", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Setup Script")).toBeInTheDocument();
    expect(screen.getByText("Run Script")).toBeInTheDocument();
    expect(screen.getByText("Archive Script")).toBeInTheDocument();
  });

  it("shows Run Script Mode options", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Run Script Mode")).toBeInTheDocument();
    expect(screen.getByText("Nonconcurrent (kill previous)")).toBeInTheDocument();
    expect(screen.getByText("Concurrent")).toBeInTheDocument();
  });

  it("shows Environment Variables section", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
  });

  it("shows Save and Cancel buttons", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    screen.getByText("Cancel").click();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error when getRepoSettings fails", async () => {
    mockGetRepoSettings.mockRejectedValueOnce(new Error("Load failed"));
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Load failed/)).toBeInTheDocument();
    });
  });

  it("loads settings on mount", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: "npm install",
      runScript: "npm start",
      archiveScript: "npm run clean",
      runScriptMode: "concurrent",
      envVars: { NODE_ENV: "test" },
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(mockGetRepoSettings).toHaveBeenCalledWith("r1");

    await waitFor(() => {
      const textareas = screen.getAllByRole("textbox");
      const setupTextarea = textareas[1] as HTMLTextAreaElement;
      expect(setupTextarea.value).toBe("npm install");
    });
  });

  it("populates script textareas with loaded settings", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: "npm install",
      runScript: "npm start",
      archiveScript: "cleanup.sh",
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      const textareas = screen.getAllByPlaceholderText("e.g. npm install");
      expect(textareas[0]).toHaveValue("npm install");
      expect(textareas[1]).toHaveValue("npm start");
      expect(textareas[2]).toHaveValue("cleanup.sh");
    });
  });

  it("allows editing setup script", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "yarn install" } });
    expect(textareas[0]).toHaveValue("yarn install");
  });

  it("allows editing run script", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[1], { target: { value: "npm run dev" } });
    expect(textareas[1]).toHaveValue("npm run dev");
  });

  it("allows editing archive script", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[2], { target: { value: "rm -rf dist" } });
    expect(textareas[2]).toHaveValue("rm -rf dist");
  });

  it("sets script to null when cleared", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: "npm install",
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      const textareas = screen.getAllByPlaceholderText("e.g. npm install");
      expect(textareas[0]).toHaveValue("npm install");
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "" } });

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        setupScript: null,
      }));
    });
  });

  it("changes run script mode to concurrent", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const nonconcurrentRadio = screen.getByLabelText("Nonconcurrent (kill previous)");
    const concurrentRadio = screen.getByLabelText("Concurrent");

    expect(nonconcurrentRadio).toBeChecked();
    expect(concurrentRadio).not.toBeChecked();

    fireEvent.click(concurrentRadio);

    expect(concurrentRadio).toBeChecked();
    expect(nonconcurrentRadio).not.toBeChecked();
  });

  it("saves settings and calls onClose on success", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", {
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
        worktreeBasePath: null,
        providerOverride: null,
        devcontainer: null,
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error when save fails", async () => {
    mockUpdateRepoSettings.mockRejectedValueOnce(new Error("Save failed"));
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText(/Save failed/)).toBeInTheDocument();
    });
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows 'Saving...' while saving", async () => {
    let resolveSave: () => void;
    mockUpdateRepoSettings.mockReturnValue(new Promise<void>((resolve) => { resolveSave = resolve; }));

    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
    expect(screen.getByText("Saving...").closest("button")).toBeDisabled();

    resolveSave!();
  });

  it("adds an environment variable", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");

    fireEvent.change(keyInput, { target: { value: "API_KEY" } });
    fireEvent.change(valueInput, { target: { value: "secret123" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(screen.getByText("API_KEY")).toBeInTheDocument();
      expect(screen.getByText("secret123")).toBeInTheDocument();
    });

    expect(keyInput).toHaveValue("");
    expect(valueInput).toHaveValue("");
  });

  it("does not add env var when key is empty", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(valueInput, { target: { value: "some-value" } });
    fireEvent.click(screen.getByText("Add"));

    expect(screen.queryByText("some-value")).not.toBeInTheDocument();
  });

  it("adds env var via Enter key on value input", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");

    fireEvent.change(keyInput, { target: { value: "MY_VAR" } });
    fireEvent.change(valueInput, { target: { value: "my-value" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("MY_VAR")).toBeInTheDocument();
      expect(screen.getByText("my-value")).toBeInTheDocument();
    });
  });

  it("removes an environment variable", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: { EXISTING_KEY: "existing-value" },
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("EXISTING_KEY")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("x");
    const envRemoveBtn = removeButtons.find((btn) => {
      return btn.closest("button")?.style.color === "var(--error)";
    });
    expect(envRemoveBtn).toBeDefined();
    fireEvent.click(envRemoveBtn!.closest("button")!);

    await waitFor(() => {
      expect(screen.queryByText("EXISTING_KEY")).not.toBeInTheDocument();
    });
  });

  it("displays existing env vars with key=value format", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: { NODE_ENV: "production", PORT: "3000" },
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
      expect(screen.getByText("production")).toBeInTheDocument();
      expect(screen.getByText("PORT")).toBeInTheDocument();
      expect(screen.getByText("3000")).toBeInTheDocument();
    });
    const equalsSigns = screen.getAllByText("=");
    expect(equalsSigns.length).toBeGreaterThanOrEqual(2);
  });

  it("saves with updated scripts and env vars", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "npm ci" } });

    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "CI" } });
    fireEvent.change(valueInput, { target: { value: "true" } });
    fireEvent.click(screen.getByText("Add"));

    fireEvent.click(screen.getByLabelText("Concurrent"));

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", {
        setupScript: "npm ci",
        runScript: null,
        archiveScript: null,
        runScriptMode: "concurrent",
        envVars: { CI: "true" },
        worktreeBasePath: null,
        providerOverride: null,
        devcontainer: null,
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when clicking backdrop overlay", () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    const backdrop = screen.getByRole("dialog", { name: "Settings: My Repo" }).closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog", { name: "Settings: My Repo" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when x header button is clicked", () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    const headerCloseBtn = screen.getByLabelText("Close settings");
    fireEvent.click(headerCloseBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("resets saving state after error", async () => {
    mockUpdateRepoSettings.mockRejectedValueOnce(new Error("Network error"));
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("updates env key input value", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const keyInput = screen.getByPlaceholderText("KEY");
    fireEvent.change(keyInput, { target: { value: "TEST_KEY" } });
    expect(keyInput).toHaveValue("TEST_KEY");
  });

  it("updates env value input value", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(valueInput, { target: { value: "test_value" } });
    expect(valueInput).toHaveValue("test_value");
  });

  it("does not add env var via non-Enter key press", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");

    fireEvent.change(keyInput, { target: { value: "SOME_KEY" } });
    fireEvent.change(valueInput, { target: { value: "some_val" } });
    fireEvent.keyDown(valueInput, { key: "a" });

    expect(screen.queryByText("SOME_KEY")).not.toBeInTheDocument();
  });

  it("sets worktreeBasePath when value is entered", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const worktreeInput = screen.getByPlaceholderText("Default: .worktrees/ (inside repo)");
    fireEvent.change(worktreeInput, { target: { value: "/custom/path" } });
    expect(worktreeInput).toHaveValue("/custom/path");

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        worktreeBasePath: "/custom/path",
      }));
    });
  });

  it("sets worktreeBasePath to null when cleared", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: "/existing/path",
      providerOverride: null,
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      const worktreeInput = screen.getByPlaceholderText("Default: .worktrees/ (inside repo)");
      expect(worktreeInput).toHaveValue("/existing/path");
    });

    const worktreeInput = screen.getByPlaceholderText("Default: .worktrees/ (inside repo)");
    fireEvent.change(worktreeInput, { target: { value: "" } });

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        worktreeBasePath: null,
      }));
    });
  });

  it("shows provider override checkbox", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Override Provider for this Repository")).toBeInTheDocument();
  });

  it("shows provider fields when override is enabled", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Override Provider for this Repository");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });
  });

  it("hides provider fields when override is disabled", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Override Provider for this Repository");
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Enter ANTHROPIC_API_KEY")).not.toBeInTheDocument();
    });
  });

  it("loads existing provider override from settings", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: {
        providerType: "Anthropic",
        envVars: { ANTHROPIC_API_KEY: "sk-work-key" },
      },
      devcontainer: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      const checkbox = screen.getByLabelText("Override Provider for this Repository");
      expect(checkbox).toBeChecked();
    });
  });

  it("saves with provider override when enabled", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Override Provider for this Repository");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY");
    fireEvent.change(apiKeyInput, { target: { value: "sk-work" } });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        providerOverride: {
          providerType: "Anthropic",
          envVars: { ANTHROPIC_API_KEY: "sk-work" },
        },
      }));
    });
  });

  it("saves with null provider override when disabled", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        providerOverride: null,
      }));
    });
  });

  // --- Provider override: change provider type ---

  it("changes provider type in override dropdown", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Enable provider override
    fireEvent.click(screen.getByLabelText("Override Provider for this Repository"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    // Change provider to Bedrock
    const providerSelect = screen.getByDisplayValue("Anthropic");
    fireEvent.change(providerSelect, { target: { value: "Bedrock" } });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter AWS_ACCESS_KEY_ID")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter AWS_SECRET_ACCESS_KEY")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter AWS_REGION")).toBeInTheDocument();
    });
  });

  it("toggles provider key visibility with Show/Hide button", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Enable provider override
    fireEvent.click(screen.getByLabelText("Override Provider for this Repository"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY");
    // Initially password type
    expect(apiKeyInput).toHaveAttribute("type", "password");

    // Click Show
    fireEvent.click(screen.getByText("Show"));
    expect(apiKeyInput).toHaveAttribute("type", "text");

    // Click Hide
    fireEvent.click(screen.getByText("Hide"));
    expect(apiKeyInput).toHaveAttribute("type", "password");
  });

  it("updates provider env var value", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("Override Provider for this Repository"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY");
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-123" } });
    expect(apiKeyInput).toHaveValue("sk-test-123");
  });

  // --- Dev container section ---

  it("shows dev container checkbox", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Dev Container")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable dev container for new workspaces")).toBeInTheDocument();
  });

  it("enables dev container and shows backend/agent selects", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Enable dev container for new workspaces");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
      expect(screen.getByText("Agent exec")).toBeInTheDocument();
      expect(screen.getByDisplayValue("devcontainer CLI")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Host (default)")).toBeInTheDocument();
    });
  });

  it("disables dev container hides backend/agent selects", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Enable dev container for new workspaces");
    // Enable
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
    });

    // Disable
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.queryByText("Backend")).not.toBeInTheDocument();
    });
  });

  it("changes devcontainer backend to rawDocker and shows image input", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Enable devcontainer
    fireEvent.click(screen.getByLabelText("Enable dev container for new workspaces"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("devcontainer CLI")).toBeInTheDocument();
    });

    // Change backend to rawDocker
    const backendSelect = screen.getByDisplayValue("devcontainer CLI");
    fireEvent.change(backendSelect, { target: { value: "rawDocker" } });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Docker image (e.g. node:20)")).toBeInTheDocument();
    });
  });

  it("updates docker image input value", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Enable devcontainer
    fireEvent.click(screen.getByLabelText("Enable dev container for new workspaces"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("devcontainer CLI")).toBeInTheDocument();
    });

    // Change to rawDocker
    fireEvent.change(screen.getByDisplayValue("devcontainer CLI"), { target: { value: "rawDocker" } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Docker image (e.g. node:20)")).toBeInTheDocument();
    });

    const imageInput = screen.getByPlaceholderText("Docker image (e.g. node:20)");
    fireEvent.change(imageInput, { target: { value: "node:20" } });
    expect(imageInput).toHaveValue("node:20");
  });

  it("sets docker image to null when cleared", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("Enable dev container for new workspaces"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("devcontainer CLI")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("devcontainer CLI"), { target: { value: "rawDocker" } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Docker image (e.g. node:20)")).toBeInTheDocument();
    });

    const imageInput = screen.getByPlaceholderText("Docker image (e.g. node:20)");
    fireEvent.change(imageInput, { target: { value: "node:20" } });
    fireEvent.change(imageInput, { target: { value: "" } });

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        devcontainer: expect.objectContaining({
          image: null,
        }),
      }));
    });
  });

  it("changes agent exec mode to container", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("Enable dev container for new workspaces"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Host (default)")).toBeInTheDocument();
    });

    const agentSelect = screen.getByDisplayValue("Host (default)");
    fireEvent.change(agentSelect, { target: { value: "container" } });

    expect(screen.getByDisplayValue("Container")).toBeInTheDocument();
  });

  it("shows detected devcontainer path when present", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: {
        enabled: true,
        backend: "devcontainerCli",
        agentExecMode: "host",
        image: null,
        composeFile: null,
        composeService: null,
        devcontainerPath: ".devcontainer/devcontainer.json",
        containerWorkspacePath: null,
        extraDockerArgs: [],
        containerEnvVars: {},
      },
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Detected: .devcontainer/devcontainer.json")).toBeInTheDocument();
    });
  });

  it("does not show detected path when devcontainerPath is null", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: {
        enabled: true,
        backend: "devcontainerCli",
        agentExecMode: "host",
        image: null,
        composeFile: null,
        composeService: null,
        devcontainerPath: null,
        containerWorkspacePath: null,
        extraDockerArgs: [],
        containerEnvVars: {},
      },
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Detected:/)).not.toBeInTheDocument();
  });

  it("does not show rawDocker image input for devcontainerCli backend", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: {
        enabled: true,
        backend: "devcontainerCli",
        agentExecMode: "host",
        image: null,
        composeFile: null,
        composeService: null,
        devcontainerPath: null,
        containerWorkspacePath: null,
        extraDockerArgs: [],
        containerEnvVars: {},
      },
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("Docker image (e.g. node:20)")).not.toBeInTheDocument();
  });

  it("loads existing devcontainer with rawDocker and shows image", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: null,
      runScript: null,
      archiveScript: null,
      runScriptMode: "nonconcurrent",
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
      devcontainer: {
        enabled: true,
        backend: "rawDocker",
        agentExecMode: "container",
        image: "node:18",
        composeFile: null,
        composeService: null,
        devcontainerPath: null,
        containerWorkspacePath: null,
        extraDockerArgs: [],
        containerEnvVars: {},
      },
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Raw Docker")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Container")).toBeInTheDocument();
      const imageInput = screen.getByPlaceholderText("Docker image (e.g. node:20)");
      expect(imageInput).toHaveValue("node:18");
    });
  });

  // --- Workspace templates section ---

  it("shows workspace templates section", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(screen.getByText("Workspace Templates")).toBeInTheDocument();
    expect(screen.getByText("Save Current Settings as Template")).toBeInTheDocument();
  });

  it("displays templates list when templates exist", async () => {
    mockedUseWorkspaceTemplateStore.mockReturnValue({
      templates: [
        { id: "t1", name: "Template One", description: "First template", repoId: "r1", settings: {} },
        { id: "t2", name: "Template Two", description: null, repoId: "r1", settings: {} },
      ],
      loadTemplates: mockLoadTemplates,
      deleteTemplate: mockDeleteTemplate,
    } as unknown as ReturnType<typeof useWorkspaceTemplateStore>);

    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);

    expect(screen.getByText("Template One")).toBeInTheDocument();
    expect(screen.getByText("First template")).toBeInTheDocument();
    expect(screen.getByText("Template Two")).toBeInTheDocument();
  });

  it("does not show description when template description is null", async () => {
    mockedUseWorkspaceTemplateStore.mockReturnValue({
      templates: [
        { id: "t1", name: "No Desc Template", description: null, repoId: "r1", settings: {} },
      ],
      loadTemplates: mockLoadTemplates,
      deleteTemplate: mockDeleteTemplate,
    } as unknown as ReturnType<typeof useWorkspaceTemplateStore>);

    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);

    expect(screen.getByText("No Desc Template")).toBeInTheDocument();
    // No description element should be present
    const templateContainer = screen.getByText("No Desc Template").closest("div[class*='flex']");
    expect(templateContainer).toBeInTheDocument();
  });

  it("deletes a template when delete button is clicked", async () => {
    mockedUseWorkspaceTemplateStore.mockReturnValue({
      templates: [
        { id: "t1", name: "My Template", description: "desc", repoId: "r1", settings: {} },
      ],
      loadTemplates: mockLoadTemplates,
      deleteTemplate: mockDeleteTemplate,
    } as unknown as ReturnType<typeof useWorkspaceTemplateStore>);

    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);

    expect(screen.getByText("My Template")).toBeInTheDocument();

    // Find the template delete button (the x with error color inside the templates section)
    const templateDeleteBtns = screen.getAllByText("x").filter((el) => {
      const btn = el.closest("button");
      return btn?.style.color === "var(--error)" && el.closest("div[class*='space-y-1']");
    });
    expect(templateDeleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(templateDeleteBtns[0].closest("button")!);

    expect(mockDeleteTemplate).toHaveBeenCalledWith("t1");
  });

  it("opens template dialog when 'Save Current Settings as Template' is clicked", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("workspace-template-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Save Current Settings as Template"));

    await waitFor(() => {
      expect(screen.getByTestId("workspace-template-dialog")).toBeInTheDocument();
    });
  });

  it("closes template dialog and reloads templates", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Open template dialog
    fireEvent.click(screen.getByText("Save Current Settings as Template"));
    await waitFor(() => {
      expect(screen.getByTestId("workspace-template-dialog")).toBeInTheDocument();
    });

    // Close it
    fireEvent.click(screen.getByText("Close Template Dialog"));

    await waitFor(() => {
      expect(screen.queryByTestId("workspace-template-dialog")).not.toBeInTheDocument();
    });

    // loadTemplates should have been called again (once on mount, once on close)
    expect(mockLoadTemplates).toHaveBeenCalledWith("r1");
  });

  it("calls loadTemplates on mount", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockLoadTemplates).toHaveBeenCalledWith("r1");
    });
  });

  it("shows provider labels in dropdown when override is enabled", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("Override Provider for this Repository"));
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });

    // Check all provider options exist in the select
    const selectEl = screen.getByDisplayValue("Anthropic");
    const options = selectEl.querySelectorAll("option");
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain("Anthropic");
    expect(optionTexts).toContain("OpenRouter");
    expect(optionTexts).toContain("Vercel AI Gateway");
    expect(optionTexts).toContain("AWS Bedrock");
    expect(optionTexts).toContain("Google Vertex");
    expect(optionTexts).toContain("Azure Foundry");
    expect(optionTexts).toContain("Custom");
  });

  it("shows no env hints for Custom provider", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText("Override Provider for this Repository"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter ANTHROPIC_API_KEY")).toBeInTheDocument();
    });

    // Change to Custom (which has no env hints)
    fireEvent.change(screen.getByDisplayValue("Anthropic"), { target: { value: "Custom" } });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Enter /)).not.toBeInTheDocument();
    });
  });

  it("saves devcontainer settings correctly", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Enable devcontainer
    fireEvent.click(screen.getByLabelText("Enable dev container for new workspaces"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("devcontainer CLI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        devcontainer: expect.objectContaining({
          enabled: true,
          backend: "devcontainerCli",
          agentExecMode: "host",
        }),
      }));
    });
  });

  it("does not call onClose when non-Escape key is pressed on backdrop", () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    const backdrop = screen.getByRole("dialog", { name: "Settings: My Repo" }).closest(".fixed")!;
    fireEvent.keyDown(backdrop, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed on backdrop", () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    const backdrop = screen.getByRole("dialog", { name: "Settings: My Repo" }).closest(".fixed")!;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("enables devcontainer with existing null devcontainer creates defaults", async () => {
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    const checkbox = screen.getByLabelText("Enable dev container for new workspaces");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateRepoSettings).toHaveBeenCalledWith("r1", expect.objectContaining({
        devcontainer: expect.objectContaining({
          enabled: true,
          backend: "devcontainerCli",
          agentExecMode: "host",
          image: null,
          composeFile: null,
          composeService: null,
          devcontainerPath: null,
          containerWorkspacePath: null,
          extraDockerArgs: [],
          containerEnvVars: {},
        }),
      }));
    });
  });

  describe("ContainerizePanel integration", () => {
    it("renders ContainerizePanel when workspaceId is provided and devcontainer is not enabled", async () => {
      render(
        <RepoSettingsPanel
          repoId="r1"
          repoName="My Repo"
          onClose={vi.fn()}
          workspaceId="ws1"
        />
      );
      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });
      expect(screen.getByTestId("containerize-panel")).toBeInTheDocument();
      expect(screen.getByTestId("containerize-panel")).toHaveAttribute("data-workspace-id", "ws1");
    });

    it("does not render ContainerizePanel when workspaceId is not provided", async () => {
      render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });
      expect(screen.queryByTestId("containerize-panel")).not.toBeInTheDocument();
    });

    it("does not render ContainerizePanel when devcontainer is already enabled", async () => {
      mockGetRepoSettings.mockResolvedValue({
        setupScript: null,
        runScript: null,
        archiveScript: null,
        runScriptMode: "nonconcurrent",
        envVars: {},
        worktreeBasePath: null,
        providerOverride: null,
        devcontainer: {
          enabled: true,
          backend: "devcontainerCli",
          agentExecMode: "host",
          image: null,
          composeFile: null,
          composeService: null,
          devcontainerPath: null,
          containerWorkspacePath: null,
          extraDockerArgs: [],
          containerEnvVars: {},
        },
      });
      render(
        <RepoSettingsPanel
          repoId="r1"
          repoName="My Repo"
          onClose={vi.fn()}
          workspaceId="ws1"
        />
      );
      await waitFor(() => {
        expect(mockGetRepoSettings).toHaveBeenCalled();
      });
      expect(screen.queryByTestId("containerize-panel")).not.toBeInTheDocument();
    });

    it("passes detectedDevcontainer to ContainerizePanel", async () => {
      mockDetectDevcontainer.mockResolvedValue(".devcontainer/devcontainer.json");
      render(
        <RepoSettingsPanel
          repoId="r1"
          repoName="My Repo"
          onClose={vi.fn()}
          workspaceId="ws1"
        />
      );
      await waitFor(() => {
        expect(mockDetectDevcontainer).toHaveBeenCalledWith("r1");
      });
      await waitFor(() => {
        expect(screen.getByTestId("containerize-panel")).toHaveAttribute(
          "data-existing",
          ".devcontainer/devcontainer.json"
        );
      });
    });
  });
});
