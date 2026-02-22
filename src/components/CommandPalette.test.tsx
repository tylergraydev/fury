import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useUIStore } from "../stores/uiStore";

vi.mock("cmdk", () => ({
  Command: ({ children, ...props }: any) => <div data-testid="command" {...props}>{children}</div>,
  CommandDialog: ({ children, open }: any) => open ? <div data-testid="command-dialog">{children}</div> : null,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: any) => <div data-testid={`group-${heading}`}>{children}</div>,
  CommandInput: (props: any) => <input {...props} data-testid="command-input" />,
  CommandItem: ({ children, onSelect }: any) => <div onClick={onSelect} role="option">{children}</div>,
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

  it("calls onAction when an item is selected", () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette open={true} onOpenChange={onOpenChange} onAction={onAction} />,
    );
    screen.getByText("Focus Terminal").click();
    expect(onAction).toHaveBeenCalledWith("focus-terminal");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

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
});
