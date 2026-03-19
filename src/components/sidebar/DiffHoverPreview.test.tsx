import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiffHoverPreview } from "./DiffHoverPreview";
import { useDiffStore } from "../../stores/diffStore";

vi.mock("../../lib/tauri", () => ({
  getFilePatch: vi.fn().mockResolvedValue(null),
  getRepoFilePatch: vi.fn().mockResolvedValue(null),
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getFileDiff: vi.fn().mockResolvedValue(null),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoFileDiff: vi.fn().mockResolvedValue(null),
}));

const mockAnchor = document.createElement("div");
mockAnchor.getBoundingClientRect = () => ({
  top: 100,
  left: 50,
  right: 200,
  bottom: 120,
  width: 150,
  height: 20,
  x: 50,
  y: 100,
  toJSON: () => {},
});

beforeEach(() => {
  useDiffStore.setState({
    patchPreviews: {},
    patchLoading: {},
    diffResults: {},
    fileDiffs: {},
    selectedFile: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("DiffHoverPreview", () => {
  const file = { path: "src/app.ts", status: "Modified" as const, additions: 5, deletions: 2 };
  const untrackedFile = { path: "src/new.ts", status: "Untracked" as const, additions: 10, deletions: 0 };

  it("returns null when anchorEl is null", () => {
    const { container } = render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={null}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state when patch is loading", () => {
    useDiffStore.setState({
      patchLoading: { "ws-1:src/app.ts": true },
    });
    render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
  });

  it("shows 'No diff available' when patch is empty", () => {
    useDiffStore.setState({
      patchPreviews: { "ws-1:src/app.ts": { path: "src/app.ts", language: "typescript", patch: "", truncated: false } },
    });
    render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    expect(screen.getByText("No diff available")).toBeInTheDocument();
  });

  it("renders diff lines with file path header", () => {
    useDiffStore.setState({
      patchPreviews: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          language: "typescript",
          patch: "@@ -1,3 +1,4 @@\n context\n-old line\n+new line\n+added",
          truncated: false,
        },
      },
    });
    render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("-old line")).toBeInTheDocument();
    expect(screen.getByText("+new line")).toBeInTheDocument();
    expect(screen.getByText("+added")).toBeInTheDocument();
  });

  it("shows truncated indicator", () => {
    useDiffStore.setState({
      patchPreviews: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          language: "typescript",
          patch: "+line 1",
          truncated: true,
        },
      },
    });
    render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    expect(screen.getByText("(truncated)")).toBeInTheDocument();
  });

  it("calls loadPatchPreview with isUntracked=true for Untracked files", async () => {
    const loadPatchPreview = vi.fn();
    useDiffStore.setState({
      loadPatchPreview,
    } as any);
    vi.useFakeTimers();
    render(
      <DiffHoverPreview
        file={untrackedFile}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    vi.advanceTimersByTime(300);
    expect(loadPatchPreview).toHaveBeenCalledWith(
      "ws-1",
      "src/new.ts",
      true,
      "workspace",
    );
    vi.useRealTimers();
  });

  it("passes contextType='repo' to loadPatchPreview", async () => {
    const loadPatchPreview = vi.fn();
    useDiffStore.setState({
      loadPatchPreview,
    } as any);
    vi.useFakeTimers();
    render(
      <DiffHoverPreview
        file={file}
        contextId="repo-1"
        contextType="repo"
        anchorEl={mockAnchor}
      />,
    );
    vi.advanceTimersByTime(300);
    expect(loadPatchPreview).toHaveBeenCalledWith(
      "repo-1",
      "src/app.ts",
      false,
      "repo",
    );
    vi.useRealTimers();
  });

  it("shows overflow message when lines exceed MAX_VISIBLE_LINES", () => {
    const manyLines = Array.from({ length: 25 }, (_, i) => `+line ${i}`).join("\n");
    useDiffStore.setState({
      patchPreviews: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          language: "typescript",
          patch: manyLines,
          truncated: false,
        },
      },
    });
    render(
      <DiffHoverPreview
        file={file}
        contextId="ws-1"
        contextType="workspace"
        anchorEl={mockAnchor}
      />,
    );
    expect(screen.getByText(/5 more lines/)).toBeInTheDocument();
  });
});
