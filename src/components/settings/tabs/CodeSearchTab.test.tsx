import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers";
import { fullSettings, mockListIndexingStatuses, mockIndexRepository } from "./test-helpers";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";
import { useUIStore } from "../../../stores/uiStore";

describe("CodeSearchTab", () => {
  const goToCodeSearchTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Code Search"));
  };

  it("shows Loading when settings not loaded", () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Code Search"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows enable toggle", () => {
    goToCodeSearchTab();
    expect(screen.getByText("Enable Semantic Code Search")).toBeInTheDocument();
  });

  it("toggles the enable checkbox", () => {
    useSettingsStore.setState({ appSettings: fullSettings });
    goToCodeSearchTab();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("shows credential fields", () => {
    goToCodeSearchTab();
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("MILVUS_ADDRESS")).toBeInTheDocument();
    expect(screen.getByText("MILVUS_TOKEN")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter token")).toBeInTheDocument();
  });

  it("credential fields are password-masked by default", () => {
    goToCodeSearchTab();
    const inputs = screen.getAllByPlaceholderText(/sk-|https:\/\/|Enter token/);
    inputs.forEach((input) => {
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("toggles credential visibility with Show/Hide buttons", () => {
    goToCodeSearchTab();
    const showButtons = screen.getAllByText("Show");
    expect(showButtons.length).toBe(3);
    fireEvent.click(showButtons[0]);
    const skInput = screen.getByPlaceholderText("sk-...");
    expect(skInput).toHaveAttribute("type", "text");
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });

  it("updates credential values on input change", () => {
    goToCodeSearchTab();
    const showButtons = screen.getAllByText("Show");
    fireEvent.click(showButtons[0]);
    const skInput = screen.getByPlaceholderText("sk-...");
    fireEvent.change(skInput, { target: { value: "sk-test-key" } });
    expect(skInput).toHaveValue("sk-test-key");
  });

  it("clears credential to null on empty input", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        claudeContext: { enabled: true, openaiApiKey: "sk-old", zillizUri: null, zillizToken: null },
      },
    });
    goToCodeSearchTab();
    const showButtons = screen.getAllByText("Show");
    fireEvent.click(showButtons[0]);
    const skInput = screen.getByPlaceholderText("sk-...");
    expect(skInput).toHaveValue("sk-old");
    fireEvent.change(skInput, { target: { value: "" } });
    expect(skInput).toHaveValue("");
  });

  it("saves settings on Save click", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToCodeSearchTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        claudeContext: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it("shows Saving... while saving", async () => {
    let resolverFn: () => void;
    const saveSettings = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolverFn = resolve; }),
    );
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToCodeSearchTab();
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });

  it("shows error when save fails", async () => {
    const saveSettings = vi.fn().mockRejectedValue(new Error("Save failed"));
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    goToCodeSearchTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(screen.getByText(/Save failed/)).toBeInTheDocument();
  });

  it("Cancel closes settings", () => {
    const closeViewTab = vi.fn();
    useUIStore.setState({ closeViewTab } as any);
    goToCodeSearchTab();
    fireEvent.click(screen.getByText("Cancel"));
    expect(closeViewTab).toHaveBeenCalledWith("settings");
  });

  it("shows repository indexing status when repos exist", async () => {
    mockListIndexingStatuses.mockResolvedValue([
      { repoId: "r1", status: "indexed", lastIndexedAt: "2024-06-01T00:00:00Z", error: null },
    ]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    expect(screen.getByText("Repository Indexing Status")).toBeInTheDocument();
    expect(screen.getByText("my-repo")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Indexed")).toBeInTheDocument();
    });
  });

  it("shows Not indexed for repos without status", () => {
    mockListIndexingStatuses.mockResolvedValue([]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    expect(screen.getByText("Not indexed")).toBeInTheDocument();
  });

  it("shows Error status and error message for errored repos", async () => {
    mockListIndexingStatuses.mockResolvedValue([
      { repoId: "r1", status: "error", lastIndexedAt: null, error: "Failed to connect" },
    ]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    await waitFor(() => {
      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.getByText("Failed to connect")).toBeInTheDocument();
    });
  });

  it("shows Indexing... status", async () => {
    mockListIndexingStatuses.mockResolvedValue([
      { repoId: "r1", status: "indexing", lastIndexedAt: null, error: null },
    ]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    await waitFor(() => {
      const indexingTexts = screen.getAllByText("Indexing...");
      expect(indexingTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls indexRepository on Re-index click", async () => {
    mockListIndexingStatuses.mockResolvedValue([
      { repoId: "r1", status: "indexed", lastIndexedAt: null, error: null },
    ]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    await waitFor(() => {
      expect(screen.getByText("Re-index")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Re-index"));
    });
    expect(mockIndexRepository).toHaveBeenCalledWith("r1");
  });

  it("shows last indexed date when available", async () => {
    mockListIndexingStatuses.mockResolvedValue([
      { repoId: "r1", status: "indexed", lastIndexedAt: "2024-06-01T00:00:00Z", error: null },
    ]);
    useRepositoryStore.setState({
      repositories: [{ id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" }],
    } as any);
    goToCodeSearchTab();
    await waitFor(() => {
      expect(screen.getByText("Indexed")).toBeInTheDocument();
    });
    expect(screen.getByText(/\d+\/\d+\/2024/)).toBeInTheDocument();
  });

  it("does not show Repository Indexing Status when no repos", () => {
    goToCodeSearchTab();
    expect(screen.queryByText("Repository Indexing Status")).not.toBeInTheDocument();
  });

  it("shows helper text", () => {
    goToCodeSearchTab();
    expect(
      screen.getByText(/Repositories are automatically indexed when added/),
    ).toBeInTheDocument();
  });
});
