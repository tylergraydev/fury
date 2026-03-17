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
});
const mockUpdateRepoSettings = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/tauri", () => ({
  getRepoSettings: (...args: unknown[]) => mockGetRepoSettings(...args),
  updateRepoSettings: (...args: unknown[]) => mockUpdateRepoSettings(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  vi.clearAllMocks();
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

  // --- New tests for full coverage ---

  it("loads settings on mount", async () => {
    mockGetRepoSettings.mockResolvedValueOnce({
      setupScript: "npm install",
      runScript: "npm start",
      archiveScript: "npm run clean",
      runScriptMode: "concurrent",
      envVars: { NODE_ENV: "test" },
      worktreeBasePath: null,
      providerOverride: null,
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    expect(mockGetRepoSettings).toHaveBeenCalledWith("r1");

    await waitFor(() => {
      const textareas = screen.getAllByRole("textbox");
      // textareas[0] is the worktree location input, scripts start at [1]
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
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      const textareas = screen.getAllByPlaceholderText("e.g. npm install");
      expect(textareas[0]).toHaveValue("npm install");
    });

    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "" } });

    // Now save and check that null was sent
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

    // Nonconcurrent should be checked by default
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
    // Should not be in saving state anymore
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
    // Save button should be disabled
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

    // Key and value inputs should be cleared
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

    // Should not add anything
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
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("EXISTING_KEY")).toBeInTheDocument();
    });

    // The remove button is the "x" text button next to the env var
    const removeButtons = screen.getAllByText("x");
    // First "x" is the close button in header, second is the env var remove button
    const envRemoveBtn = removeButtons.find((btn) => {
      // The env var remove button is inside the env vars list
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
    });
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
      expect(screen.getByText("production")).toBeInTheDocument();
      expect(screen.getByText("PORT")).toBeInTheDocument();
      expect(screen.getByText("3000")).toBeInTheDocument();
    });
    // The "=" separator should be present
    const equalsSigns = screen.getAllByText("=");
    expect(equalsSigns.length).toBeGreaterThanOrEqual(2);
  });

  it("saves with updated scripts and env vars", async () => {
    const onClose = vi.fn();
    render(<RepoSettingsPanel repoId="r1" repoName="My Repo" onClose={onClose} />);
    await waitFor(() => {
      expect(mockGetRepoSettings).toHaveBeenCalled();
    });

    // Set a setup script
    const textareas = screen.getAllByPlaceholderText("e.g. npm install");
    fireEvent.change(textareas[0], { target: { value: "npm ci" } });

    // Add an env var
    const keyInput = screen.getByPlaceholderText("KEY");
    const valueInput = screen.getByPlaceholderText("value");
    fireEvent.change(keyInput, { target: { value: "CI" } });
    fireEvent.change(valueInput, { target: { value: "true" } });
    fireEvent.click(screen.getByText("Add"));

    // Switch to concurrent mode
    fireEvent.click(screen.getByLabelText("Concurrent"));

    // Save
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
    // The header close button says "x"
    const headerCloseBtn = screen.getAllByText("x")[0].closest("button")!;
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
    // Button should show "Save" again, not "Saving..."
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

    // Should not have added the env var
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

    // Save and verify
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

    // Enable then disable
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
});
