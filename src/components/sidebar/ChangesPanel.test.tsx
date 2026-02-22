import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "custom-dark",
  configureMonacoTheme: vi.fn(),
}));

import { ChangesPanel } from "./ChangesPanel";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getFileDiff: vi.fn().mockResolvedValue(null),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoFileDiff: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useDiffStore.setState({
    diffResults: {},
    selectedFile: {},
    fileDiffs: {},
    loading: false,
    error: null,
  });
  useAgentStore.setState({ agents: {} });
  vi.clearAllMocks();
});

describe("ChangesPanel", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };

  it("shows no changes when empty", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useDiffStore.setState({ loading: true });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Loading changes...")).toBeInTheDocument();
  });

  it("shows file count in summary", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 10, deletions: 3 },
            { path: "src/new.ts", status: "Added", additions: 20, deletions: 0 },
          ],
          totalAdditions: 30,
          totalDeletions: 3,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("shows file names from paths", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/components/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("shows status labels (M for Modified, A for Added)", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/mod.ts", status: "Modified", additions: 1, deletions: 1 },
            { path: "src/new.ts", status: "Added", additions: 5, deletions: 0 },
          ],
          totalAdditions: 6,
          totalDeletions: 1,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows Refresh button", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("shows single file with correct count", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/only.ts", status: "Modified", additions: 7, deletions: 0 },
          ],
          totalAdditions: 7,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });
});
