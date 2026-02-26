import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffPanel } from "./DiffPanel";
import { useDiffStore } from "../../stores/diffStore";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: (props: Record<string, unknown>) => (
    <div
      data-testid="diff-editor"
      data-original={props.original}
      data-modified={props.modified}
      data-language={props.language}
    />
  ),
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "custom-theme",
  configureMonacoTheme: vi.fn(),
}));

describe("DiffPanel", () => {
  beforeEach(() => {
    useDiffStore.setState({
      selectedFile: {},
      fileDiffs: {},
    });
  });

  it("shows empty state when no file is selected", () => {
    render(<DiffPanel contextId="ctx1" />);
    expect(
      screen.getByText(
        "Select a file from the Changes panel to view its diff",
      ),
    ).toBeInTheDocument();
  });

  it("shows empty state when file selected but no diff data", () => {
    useDiffStore.setState({
      selectedFile: { ctx1: "src/foo.ts" },
      fileDiffs: {},
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(
      screen.getByText(
        "Select a file from the Changes panel to view its diff",
      ),
    ).toBeInTheDocument();
  });

  it("renders filename header when file and diff data exist", () => {
    useDiffStore.setState({
      selectedFile: { ctx1: "src/foo.ts" },
      fileDiffs: {
        "ctx1:src/foo.ts": {
          path: "src/foo.ts",
          original: "old code",
          modified: "new code",
          language: "typescript",
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();
  });

  it("passes correct props to DiffEditor", () => {
    useDiffStore.setState({
      selectedFile: { ctx1: "src/foo.ts" },
      fileDiffs: {
        "ctx1:src/foo.ts": {
          path: "src/foo.ts",
          original: "old",
          modified: "new",
          language: "typescript",
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    const editor = screen.getByTestId("diff-editor");
    expect(editor).toHaveAttribute("data-original", "old");
    expect(editor).toHaveAttribute("data-modified", "new");
    expect(editor).toHaveAttribute("data-language", "typescript");
  });
});
