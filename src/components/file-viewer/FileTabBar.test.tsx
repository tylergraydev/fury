import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("monaco-editor", () => ({}));
vi.mock("../../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn(),
}));
vi.mock("../../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
}));
vi.mock("lucide-react", () => ({
  X: ({ className }: { className?: string }) => <span className={className} data-testid="x-icon" />,
  Settings: ({ className }: { className?: string }) => <span className={className} data-testid="settings-icon" />,
  GitMerge: ({ className }: { className?: string }) => <span className={className} data-testid="merge-icon" />,
  History: ({ className }: { className?: string }) => <span className={className} data-testid="history-icon" />,
}));

import { FileTabBar } from "./FileTabBar";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useUIStore } from "../../stores/uiStore";

beforeEach(() => {
  useFileViewerStore.setState({
    tabs: [],
    activeTabId: null,
  });
  useUIStore.setState({
    viewTabs: [{ id: "chat", type: "chat", label: "Chat", pinned: true }],
    activeViewTabId: "chat",
  });
  vi.clearAllMocks();
});

describe("FileTabBar", () => {
  it("renders the Chat tab", () => {
    render(<FileTabBar />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("renders file tabs with file names", () => {
    useFileViewerStore.setState({
      tabs: [
        { id: "tab-1", filePath: "src/main.ts", pinned: false, dirty: false, saving: false },
        { id: "tab-2", filePath: "src/app.tsx", pinned: false, dirty: false, saving: false },
      ],
      activeTabId: null,
    });
    render(<FileTabBar />);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("app.tsx")).toBeInTheDocument();
  });

  it("shows dirty indicator for unsaved files", () => {
    useFileViewerStore.setState({
      tabs: [
        { id: "tab-1", filePath: "src/main.ts", pinned: false, dirty: true, saving: false },
      ],
      activeTabId: "tab-1",
    });
    render(<FileTabBar />);
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("shows saving indicator", () => {
    useFileViewerStore.setState({
      tabs: [
        { id: "tab-1", filePath: "src/main.ts", pinned: false, dirty: false, saving: true },
      ],
      activeTabId: null,
    });
    render(<FileTabBar />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("renders view tabs on the right side", () => {
    useUIStore.setState({
      viewTabs: [
        { id: "chat", type: "chat", label: "Chat", pinned: true },
        { id: "merge-1", type: "merge", label: "Merge", pinned: false },
      ],
      activeViewTabId: "chat",
    });
    render(<FileTabBar />);
    // The view tab label "Merge" should be visible
    expect(screen.getByText(/Merge/)).toBeInTheDocument();
    expect(screen.getByTestId("merge-icon")).toBeInTheDocument();
  });
});
