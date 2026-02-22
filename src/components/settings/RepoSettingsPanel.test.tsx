import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RepoSettingsPanel } from "./RepoSettingsPanel";

const mockGetRepoSettings = vi.fn().mockResolvedValue({
  setupScript: null,
  runScript: null,
  archiveScript: null,
  runScriptMode: "nonconcurrent",
  envVars: {},
  worktreeBasePath: null,
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
    expect(screen.getByText("Settings: My Repo")).toBeInTheDocument();
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
});
