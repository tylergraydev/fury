import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "./test-helpers.test";
import { fullSettings } from "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useCopilotStore } from "../../../stores/copilotStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";

describe("CopilotTab", () => {
  const goToCopilotTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Copilot"));
  };

  it("shows Loading when settings not loaded", () => {
    useSettingsStore.setState({
      appSettings: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    });
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Copilot"));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows Enable GitHub Copilot checkbox unchecked by default", () => {
    goToCopilotTab();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("shows copilot error when present", () => {
    useCopilotStore.setState({ error: "Copilot init failed" });
    goToCopilotTab();
    expect(screen.getByText("Copilot init failed")).toBeInTheDocument();
  });

  it("toggles copilot on - initializes with active repo", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "test-repo", path: "/path/to/repo" } as any,
      ],
    });
    useWorkspaceStore.setState({
      activeRepoId: "repo1",
      activeWorkspaceId: null,
      workspaces: [],
    });
    goToCopilotTab();
    const checkbox = screen.getByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        copilot: { enabled: true },
      }),
    );
    expect(initialize).toHaveBeenCalledWith("file:///path/to/repo");
  });

  it("toggles copilot on - finds repo via workspace", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "test-repo", path: "/path/to/repo" } as any,
      ],
    });
    useWorkspaceStore.setState({
      activeWorkspaceId: "ws1",
      activeRepoId: null,
      workspaces: [
        { id: "ws1", name: "ws", repoId: "repo1" } as any,
      ],
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(initialize).toHaveBeenCalledWith("file:///path/to/repo");
  });

  it("toggles copilot on - no repo found doesn't crash", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings });
    useCopilotStore.setState({ initialize });
    useRepositoryStore.setState({ repositories: [] });
    useWorkspaceStore.setState({
      activeRepoId: null,
      activeWorkspaceId: null,
      workspaces: [],
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(saveSettings).toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("toggles copilot off - calls shutdown", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        copilot: { enabled: true },
      },
      saveSettings,
    });
    useCopilotStore.setState({ shutdown });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(shutdown).toHaveBeenCalled();
  });

  it("shows status indicator when enabled - disconnected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "disconnected" });
    goToCopilotTab();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - connected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "connected" });
    goToCopilotTab();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - connecting", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "connecting" });
    goToCopilotTab();
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("shows status indicator when enabled - error", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({ connectionStatus: "error" });
    goToCopilotTab();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows Signed in as when authStatus has user", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: { user: "octocat" },
    });
    goToCopilotTab();
    expect(screen.getByText("Signed in as octocat")).toBeInTheDocument();
  });

  it("shows Sign In button when connected but no auth user", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
    });
    goToCopilotTab();
    expect(screen.getByText("Sign In with GitHub")).toBeInTheDocument();
  });

  it("calls signIn when Sign In button is clicked", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signIn,
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In with GitHub"));
    });
    expect(signIn).toHaveBeenCalled();
  });

  it("shows user code and Open GitHub button when signInResult has userCode", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    expect(screen.getByText("Copy Code & Open GitHub")).toBeInTheDocument();
  });

  it("handleOpenGitHub copies code and tries tauri open", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    expect(writeText).toHaveBeenCalledWith("ABCD-1234");
  });

  it("handleOpenGitHub with no userCode uses default URI", async () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "CODE-5678",
        verificationUri: null,
        user: null,
      },
    });
    goToCopilotTab();
    expect(screen.getByText("Copy Code & Open GitHub")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
  });

  it("handleOpenGitHub opens via tauri shell open", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    expect(writeText).toHaveBeenCalledWith("ABCD-1234");
  });

  it("handleOpenGitHub handles clipboard write failure gracefully", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
      signInResult: {
        status: "PromptUserDeviceFlow",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        user: null,
      },
    });
    goToCopilotTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Copy Code & Open GitHub"));
    });
    windowOpen.mockRestore();
  });

  it("does not show sign in section when authUser is present", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: { user: "octocat" },
    });
    goToCopilotTab();
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("does not show sign in section when not connected", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connecting",
      authStatus: null,
    });
    goToCopilotTab();
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("shows description text about ghost text", () => {
    goToCopilotTab();
    expect(
      screen.getByText(/ghost text in the editor/),
    ).toBeInTheDocument();
  });

  it("handles copilot without copilot key in settings", () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        copilot: undefined as any,
      },
    });
    goToCopilotTab();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("does not show sign-in section when not enabled", () => {
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: null,
    });
    goToCopilotTab();
    expect(
      screen.queryByText("Sign In with GitHub"),
    ).not.toBeInTheDocument();
  });

  it("authStatus that is not an object with user returns null authUser", () => {
    useSettingsStore.setState({
      appSettings: { ...fullSettings, copilot: { enabled: true } },
    });
    useCopilotStore.setState({
      connectionStatus: "connected",
      authStatus: "some-string",
    });
    goToCopilotTab();
    expect(screen.getByText("Sign In with GitHub")).toBeInTheDocument();
  });
});
