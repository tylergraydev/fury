import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({ ensureTypesLoaded: vi.fn() }));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
}));

vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  PanelGroup: ({ children }: any) => <div data-testid="panel-group">{children}</div>,
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("lucide-react", () => ({
  ChevronUp: () => <span data-testid="chevron-up" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
}));

vi.mock("../sidebar/FileTreePanel", () => ({
  FileTreePanel: () => <div data-testid="file-tree-panel" />,
}));
vi.mock("../sidebar/ChangesPanel", () => ({
  ChangesPanel: () => <div data-testid="changes-panel" />,
}));
vi.mock("../sidebar/ChecksPanel", () => ({
  ChecksPanel: () => <div data-testid="checks-panel" />,
}));
vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));
vi.mock("../terminal/RunPanel", () => ({
  RunPanel: () => <div data-testid="run-panel" />,
}));
vi.mock("../terminal/SetupPanel", () => ({
  SetupPanel: () => <div data-testid="setup-panel" />,
}));
vi.mock("../ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

import { RightSidebar } from "./RightSidebar";
import { useUIStore } from "../../stores/uiStore";
import { useDiffStore } from "../../stores/diffStore";

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  listWorkspaceFiles: vi.fn().mockResolvedValue([]),
  readWorkspaceFile: vi.fn().mockResolvedValue({ content: "", language: "text" }),
  writeWorkspaceFile: vi.fn().mockResolvedValue({ content: "", language: "text", formatted: false }),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useUIStore.setState({
    rightSidebarTab: "files",
    bottomTab: "terminal",
  });
  useDiffStore.setState({
    diffResults: {},
  });
  vi.clearAllMocks();
});

describe("RightSidebar", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };

  it("renders tab bar with All files, Changes, Checks tabs for workspace", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("All files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Checks")).toBeInTheDocument();
  });

  it("renders only All files and Changes for repo context", () => {
    render(<RightSidebar context={{ id: "r1", type: "repo" }} />);
    expect(screen.getByText("All files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.queryByText("Checks")).not.toBeInTheDocument();
  });

  it("shows FileTreePanel by default", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
  });

  it("switches to Changes tab", () => {
    render(<RightSidebar context={wsContext} />);
    fireEvent.click(screen.getByText("Changes"));
    expect(screen.getByTestId("changes-panel")).toBeInTheDocument();
  });

  it("shows bottom panel tabs (Setup, Run, Terminal)", () => {
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("shows change count in Changes tab label", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "a.ts", status: "Modified", additions: 1, deletions: 0 },
            { path: "b.ts", status: "Added", additions: 2, deletions: 0 },
          ],
          totalAdditions: 3,
          totalDeletions: 0,
        },
      },
    });
    render(<RightSidebar context={wsContext} />);
    expect(screen.getByText("Changes 2")).toBeInTheDocument();
  });
});
