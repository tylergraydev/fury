import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useUIStore } from "../stores/uiStore";
import { SHORTCUTS } from "../lib/keybindings";

vi.mock("cmdk", () => ({
  Command: ({ children, ...props }: any) => <div data-testid="command" {...props}>{children}</div>,
  CommandDialog: ({ children, open }: any) => open ? <div data-testid="command-dialog">{children}</div> : null,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: any) => <div data-testid={`group-${heading}`}>{children}</div>,
  CommandInput: (props: any) => <input {...props} data-testid="command-input" />,
  CommandItem: ({ children, onSelect, ...props }: any) => (
    <div onClick={onSelect} role="option" {...props}>{children}</div>
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}));

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
  });
  useRepositoryStore.setState({
    repositories: [],
  });
  useUIStore.setState({
    rightSidebarTab: "files",
  });
  vi.clearAllMocks();
});

describe("CommandPalette", () => {
  it("does not render when closed", () => {
    render(
      <CommandPalette open={false} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    expect(screen.queryByTestId("command-dialog")).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    expect(screen.getByTestId("command-dialog")).toBeInTheDocument();
  });

  it("renders sidebar section with expected items", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    expect(screen.getByText("All Files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Checks / PR")).toBeInTheDocument();
    expect(screen.getByText("Toggle Right Sidebar")).toBeInTheDocument();
  });

  it("renders views section", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    expect(screen.getByText("Switch to Chat")).toBeInTheDocument();
    expect(screen.getByText("Open Settings")).toBeInTheDocument();
    expect(screen.getByText("Open Merge View")).toBeInTheDocument();
    expect(screen.getByText("Open History")).toBeInTheDocument();
  });

  it("renders actions section", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    expect(screen.getByText("Focus Terminal")).toBeInTheDocument();
    expect(screen.getByText("New Workspace")).toBeInTheDocument();
    expect(screen.getByText("New Session")).toBeInTheDocument();
  });

  // --- Individual command selections ---
  describe("command selections", () => {
    it("calls onAction with right-sidebar-files on All Files click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("All Files").click();
      expect(onAction).toHaveBeenCalledWith("right-sidebar-files");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with right-sidebar-changes on Changes click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Changes").click();
      expect(onAction).toHaveBeenCalledWith("right-sidebar-changes");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with right-sidebar-checks on Checks / PR click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Checks / PR").click();
      expect(onAction).toHaveBeenCalledWith("right-sidebar-checks");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with toggle-right-sidebar", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Toggle Right Sidebar").click();
      expect(onAction).toHaveBeenCalledWith("toggle-right-sidebar");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with view-chat on Switch to Chat click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Switch to Chat").click();
      expect(onAction).toHaveBeenCalledWith("view-chat");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with open-settings on Open Settings click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Open Settings").click();
      expect(onAction).toHaveBeenCalledWith("open-settings");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with view-merge on Open Merge View click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Open Merge View").click();
      expect(onAction).toHaveBeenCalledWith("view-merge");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with view-history on Open History click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Open History").click();
      expect(onAction).toHaveBeenCalledWith("view-history");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with focus-terminal on Focus Terminal click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("Focus Terminal").click();
      expect(onAction).toHaveBeenCalledWith("focus-terminal");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with new-workspace on New Workspace click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("New Workspace").click();
      expect(onAction).toHaveBeenCalledWith("new-workspace");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onAction with new-session on New Session click", () => {
      const onAction = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
      );
      screen.getByText("New Session").click();
      expect(onAction).toHaveBeenCalledWith("new-session");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // --- Workspace switching ---
  describe("workspace switching", () => {
    it("shows workspace switching section when multiple workspaces exist", () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: "ws-1", name: "Workspace 1", repoId: "r1", branch: "main" },
          { id: "ws-2", name: "Workspace 2", repoId: "r1", branch: "dev" },
        ] as any,
        activeWorkspaceId: "ws-1",
      });
      useRepositoryStore.setState({
        repositories: [{ id: "r1", name: "my-repo" }] as any,
      });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      // Should show non-active workspace for switching
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
    });

    it("does not show workspace switching with only one workspace", () => {
      useWorkspaceStore.setState({
        workspaces: [{ id: "ws-1", name: "Only WS", repoId: "r1", branch: "main" }] as any,
        activeWorkspaceId: "ws-1",
      });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      expect(screen.queryByTestId("group-Switch Workspace")).not.toBeInTheDocument();
    });

    it("clicking workspace switch calls setActive on workspace store", () => {
      const onOpenChange = vi.fn();
      const setActiveSpy = vi.fn();
      useWorkspaceStore.setState({
        workspaces: [
          { id: "ws-1", name: "Workspace 1", repoId: "r1", branch: "main" },
          { id: "ws-2", name: "Workspace 2", repoId: "r1", branch: "dev" },
          { id: "ws-3", name: "Workspace 3", repoId: "r1", branch: "feat" },
        ] as any,
        activeWorkspaceId: "ws-1",
        setActive: setActiveSpy,
      });
      useRepositoryStore.setState({
        repositories: [{ id: "r1", name: "my-repo" }] as any,
      });
      render(
        <CommandPalette open={true} onOpenChange={onOpenChange} onAction={vi.fn()} />,
      );
      screen.getByText("Workspace 2").click();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(setActiveSpy).toHaveBeenCalledWith("ws-2");
    });

    it("shows repo name and branch for workspace switch items", () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: "ws-1", name: "WS 1", repoId: "r1", branch: "main" },
          { id: "ws-2", name: "WS 2", repoId: "r1", branch: "dev" },
        ] as any,
        activeWorkspaceId: "ws-1",
      });
      useRepositoryStore.setState({
        repositories: [{ id: "r1", name: "my-repo" }] as any,
      });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      expect(screen.getByText(/my-repo \/ dev/)).toBeInTheDocument();
    });

    it("filters out active workspace from switch list", () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: "ws-1", name: "Active WS", repoId: "r1", branch: "main" },
          { id: "ws-2", name: "Other WS", repoId: "r1", branch: "dev" },
        ] as any,
        activeWorkspaceId: "ws-1",
      });
      useRepositoryStore.setState({
        repositories: [{ id: "r1", name: "my-repo" }] as any,
      });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      expect(screen.queryByText("Active WS")).not.toBeInTheDocument();
      expect(screen.getByText("Other WS")).toBeInTheDocument();
    });
  });

  // --- PaletteItem ---
  describe("PaletteItem", () => {
    it("shows active indicator for files tab when rightSidebarTab is files", () => {
      useUIStore.setState({ rightSidebarTab: "files" });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      // The All Files item should have data-active="true"
      const allFilesOption = screen.getByText("All Files").closest("[role='option']");
      expect(allFilesOption).toHaveAttribute("data-active", "true");
    });

    it("shows active indicator for changes tab when rightSidebarTab is changes", () => {
      useUIStore.setState({ rightSidebarTab: "changes" });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      const changesOption = screen.getByText("Changes").closest("[role='option']");
      expect(changesOption).toHaveAttribute("data-active", "true");
    });

    it("shows active indicator for checks tab when rightSidebarTab is checks", () => {
      useUIStore.setState({ rightSidebarTab: "checks" });
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      const checksOption = screen.getByText("Checks / PR").closest("[role='option']");
      expect(checksOption).toHaveAttribute("data-active", "true");
    });

    it("shows keyboard shortcut for items that have shortcuts", () => {
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      // The shortcutFor function should resolve shortcuts for known actions
      // Open Settings has a shortcut (Cmd+,)
      const kbds = document.querySelectorAll("kbd");
      expect(kbds.length).toBeGreaterThan(0);
    });

    it("does not show shortcut for items without shortcuts", () => {
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
      );
      // view-chat does not have a shortcut in the SHORTCUTS array
      const chatItem = screen.getByText("Switch to Chat").closest("[role='option']");
      const kbd = chatItem?.querySelector("kbd");
      expect(kbd).toBeNull();
    });
  });

  // --- shortcutFor returns undefined for unknown actions ---
  it("returns undefined shortcut for unknown action", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    // "New Session" doesn't have a shortcut; should not render kbd
    const newSessionItem = screen.getByText("New Session").closest("[role='option']");
    const kbd = newSessionItem?.querySelector("kbd");
    expect(kbd).toBeNull();
  });

  it("renders items without shortcuts (view-chat, view-merge, view-history, new-session) without kbd", () => {
    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );
    // These actions have no entry in the SHORTCUTS array, so shortcutFor returns undefined
    const noShortcutItems = ["Switch to Chat", "Open Merge View", "Open History", "New Session"];
    for (const label of noShortcutItems) {
      const item = screen.getByText(label).closest("[role='option']");
      expect(item?.querySelector("kbd")).toBeNull();
    }
  });

  it("shortcutFor returns undefined when SHORTCUTS has no matching action", async () => {
    // Temporarily clear SHORTCUTS array to exercise the undefined branch of shortcutFor
    const origShortcuts = [...SHORTCUTS];
    SHORTCUTS.length = 0;

    render(
      <CommandPalette open={true} onOpenChange={vi.fn()} onAction={vi.fn()} />,
    );

    // All items should render without any kbd shortcut labels
    const allOptions = screen.getAllByRole("option");
    for (const option of allOptions) {
      expect(option.querySelector("kbd")).toBeNull();
    }

    // Restore SHORTCUTS
    SHORTCUTS.push(...origShortcuts);
  });
});
