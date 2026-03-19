import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Send: ({ className }: { className?: string }) => <span className={className} data-testid="send-icon" />,
}));

import { BroadcastComposer } from "./BroadcastComposer";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import type { WorkspaceInfo } from "../../lib/tauri";

const makeWorkspace = (id: string, name: string): WorkspaceInfo => ({
  id,
  repoId: "repo-1",
  name,
  branch: `branch-${id}`,
  status: "Active",
  portBase: 3000,
  autoCommit: true,
  pinned: false,
  createdAt: "2024-01-01T00:00:00Z",
  archivedAt: null,
});

const ws1 = makeWorkspace("ws-1", "frontend");
const ws2 = makeWorkspace("ws-2", "backend");
const ws3 = makeWorkspace("ws-3", "tests");

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  useChatStore.setState({ messages: {}, streamingText: {} });
  vi.clearAllMocks();
});

describe("BroadcastComposer", () => {
  it("renders workspace checkboxes for all workspaces", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2, ws3]} />);
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("tests")).toBeInTheDocument();
  });

  it("all checkboxes are checked by default", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2]} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("shows send button with count", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2, ws3]} />);
    expect(screen.getByText("Send to 3")).toBeInTheDocument();
  });

  it("toggling a checkbox updates selection count", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2, ws3]} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Uncheck ws-1
    expect(screen.getByText("Send to 2")).toBeInTheDocument();
  });

  it("deselect all / select all toggle works", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2]} />);
    // All selected initially
    expect(screen.getByText("Deselect all")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Deselect all"));
    expect(screen.getByText("Select all")).toBeInTheDocument();
    expect(screen.getByText("Send to 0")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("Send to 2")).toBeInTheDocument();
  });

  it("send button is disabled when message is empty", () => {
    render(<BroadcastComposer workspaces={[ws1]} />);
    const sendButton = screen.getByText("Send to 1").closest("button")!;
    expect(sendButton).toBeDisabled();
  });

  it("send button is disabled when no workspaces selected", () => {
    render(<BroadcastComposer workspaces={[ws1]} />);
    // Type a message first
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    // Deselect all
    fireEvent.click(screen.getByText("Deselect all"));
    const sendButton = screen.getByText("Send to 0").closest("button")!;
    expect(sendButton).toBeDisabled();
  });

  it("send button is disabled when all selected workspaces are running", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
    });
    render(<BroadcastComposer workspaces={[ws1]} />);
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const sendButton = screen.getByText("Send to 1").closest("button")!;
    expect(sendButton).toBeDisabled();
  });

  it("shows running indicator next to running workspaces", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
    });
    render(<BroadcastComposer workspaces={[ws1, ws2]} />);
    // The running workspace should have the pulse indicator
    const labels = screen.getAllByText(/frontend|backend/);
    const frontendLabel = labels.find((el) => el.textContent === "frontend")!;
    const pulseIndicator = frontendLabel.parentElement?.querySelector(".animate-pulse");
    expect(pulseIndicator).toBeTruthy();
  });

  it("calls broadcastMessage and addUserMessage on send", async () => {
    const broadcastMessage = vi.fn().mockResolvedValue({ succeeded: ["ws-1", "ws-2"], failed: [] });
    const addUserMessage = vi.fn();
    useAgentStore.setState({ broadcastMessage });
    useChatStore.setState({ addUserMessage });

    render(<BroadcastComposer workspaces={[ws1, ws2]} />);
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "build the feature" } });
    fireEvent.click(screen.getByText("Send to 2").closest("button")!);

    // Wait for async handler
    await vi.waitFor(() => {
      expect(addUserMessage).toHaveBeenCalledTimes(2);
    });
    expect(addUserMessage).toHaveBeenCalledWith("ws-1", "build the feature");
    expect(addUserMessage).toHaveBeenCalledWith("ws-2", "build the feature");
    expect(broadcastMessage).toHaveBeenCalledWith(
      expect.arrayContaining(["ws-1", "ws-2"]),
      "build the feature",
    );
  });

  it("renders placeholder text", () => {
    render(<BroadcastComposer workspaces={[ws1]} />);
    expect(screen.getByPlaceholderText("Broadcast message to selected workspaces...")).toBeInTheDocument();
  });

  it("re-adds a workspace after unchecking and checking it again", () => {
    render(<BroadcastComposer workspaces={[ws1, ws2]} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Uncheck ws-1
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText("Send to 1")).toBeInTheDocument();
    // Re-check ws-1
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText("Send to 2")).toBeInTheDocument();
  });

  it("sends message via Cmd/Ctrl+Enter keyboard shortcut", async () => {
    const broadcastMessage = vi.fn().mockResolvedValue({ succeeded: ["ws-1"], failed: [] });
    const addUserMessage = vi.fn();
    useAgentStore.setState({ broadcastMessage });
    useChatStore.setState({ addUserMessage });

    render(<BroadcastComposer workspaces={[ws1]} />);
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "keyboard send" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await vi.waitFor(() => {
      expect(addUserMessage).toHaveBeenCalledWith("ws-1", "keyboard send");
    });
    expect(broadcastMessage).toHaveBeenCalledWith(["ws-1"], "keyboard send");
  });

  it("sends message via Ctrl+Enter keyboard shortcut", async () => {
    const broadcastMessage = vi.fn().mockResolvedValue({ succeeded: ["ws-1"], failed: [] });
    const addUserMessage = vi.fn();
    useAgentStore.setState({ broadcastMessage });
    useChatStore.setState({ addUserMessage });

    render(<BroadcastComposer workspaces={[ws1]} />);
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "ctrl send" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await vi.waitFor(() => {
      expect(addUserMessage).toHaveBeenCalledWith("ws-1", "ctrl send");
    });
  });

  it("does not send on Enter without meta/ctrl key", () => {
    const broadcastMessage = vi.fn();
    useAgentStore.setState({ broadcastMessage });

    render(<BroadcastComposer workspaces={[ws1]} />);
    const textarea = screen.getByPlaceholderText("Broadcast message to selected workspaces...");
    fireEvent.change(textarea, { target: { value: "no send" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(broadcastMessage).not.toHaveBeenCalled();
  });
});
