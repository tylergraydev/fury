import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: any) => <div data-testid="monaco-editor">{value}</div>,
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "test-theme",
  configureMonacoTheme: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkles-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  resolveConflict: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  listChatMessages: vi.fn().mockResolvedValue([]),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { ConflictResolver } from "./ConflictResolver";
import { useMergeStore } from "../../stores/mergeStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";

const mockResolveConflict = vi.fn();
const mockAddUserMessage = vi.fn();
const mockSendMessage = vi.fn();

beforeEach(() => {
  useMergeStore.setState({
    conflictedFiles: {},
    selectedConflictFile: {},
    conflictContent: {},
    loading: {},
    error: {},
    branchStatus: {},
    comparisonTarget: {},
    comparisonDiff: {},
    comparisonFileDiff: {},
    comparisonSelectedFile: {},
    activeSection: {},
    resolveConflict: mockResolveConflict,
  });
  useAgentStore.setState({
    agents: {},
    sendMessage: mockSendMessage,
  });
  useChatStore.setState({
    messages: {},
    streamingText: {},
    subscriptions: {},
    addUserMessage: mockAddUserMessage,
  });
  vi.clearAllMocks();
});

const conflict = {
  path: "src/utils.ts",
  base: "base content",
  ours: "ours content",
  theirs: "theirs content",
  merged: "merged content",
  language: "typescript",
};

describe("ConflictResolver", () => {
  it("renders the conflict file path", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
  });

  it("shows all 4 tab labels", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    expect(screen.getByText("Current (with markers)")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Ours")).toBeInTheDocument();
    expect(screen.getByText("Theirs")).toBeInTheDocument();
  });

  it("default tab is Current (with markers)", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    // The editor should show merged content by default
    expect(screen.getByTestId("monaco-editor")).toHaveTextContent(
      "merged content",
    );
  });

  it("clicking a tab switches it", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    // Click "Base" tab
    fireEvent.click(screen.getByText("Base"));
    expect(screen.getByTestId("monaco-editor")).toHaveTextContent(
      "base content",
    );
    // Click "Ours" tab
    fireEvent.click(screen.getByText("Ours"));
    expect(screen.getByTestId("monaco-editor")).toHaveTextContent(
      "ours content",
    );
    // Click "Theirs" tab
    fireEvent.click(screen.getByText("Theirs"));
    expect(screen.getByTestId("monaco-editor")).toHaveTextContent(
      "theirs content",
    );
  });

  it("shows Accept Ours button", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    expect(screen.getByText("Accept Ours")).toBeInTheDocument();
  });

  it("shows Accept Theirs button", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    expect(screen.getByText("Accept Theirs")).toBeInTheDocument();
  });

  it("shows Resolve with AI button with Sparkles icon", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    expect(screen.getByText("Resolve with AI")).toBeInTheDocument();
    expect(screen.getByTestId("sparkles-icon")).toBeInTheDocument();
  });

  it("clicking Accept Ours calls resolveConflict with ours", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    fireEvent.click(screen.getByText("Accept Ours"));
    expect(mockResolveConflict).toHaveBeenCalledWith(
      "ws-1",
      "src/utils.ts",
      "ours",
    );
  });

  it("clicking Accept Theirs calls resolveConflict with theirs", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    fireEvent.click(screen.getByText("Accept Theirs"));
    expect(mockResolveConflict).toHaveBeenCalledWith(
      "ws-1",
      "src/utils.ts",
      "theirs",
    );
  });

  it("clicking Resolve with AI calls addUserMessage and sendMessage", () => {
    render(<ConflictResolver workspaceId="ws-1" conflict={conflict} />);
    fireEvent.click(screen.getByText("Resolve with AI"));
    expect(mockAddUserMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining("src/utils.ts"),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining("src/utils.ts"),
      "workspace",
    );
  });
});
