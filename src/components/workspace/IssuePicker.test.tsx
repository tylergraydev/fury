import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Search: () => <span data-testid="search-icon" />,
  X: () => <span data-testid="x-icon" />,
  CircleDot: () => <span data-testid="circle-dot" />,
  ExternalLink: () => <span data-testid="external-link" />,
  Unlink: () => <span data-testid="unlink-icon" />,
}));

const mockSearchIssues = vi.fn();
const mockClearSearch = vi.fn();
const mockLoadLinkedIssues = vi.fn();
const mockLinkIssue = vi.fn();
const mockUnlinkIssue = vi.fn();

// Track current state for the mock store
let storeState: Record<string, any> = {};

function getStoreValue(selector?: (s: any) => any) {
  const full = {
    searchResults: [],
    searchLoading: false,
    searchError: null,
    linkedIssues: {},
    loading: {},
    searchIssues: mockSearchIssues,
    clearSearch: mockClearSearch,
    loadLinkedIssues: mockLoadLinkedIssues,
    linkIssue: mockLinkIssue,
    unlinkIssue: mockUnlinkIssue,
    ...storeState,
  };
  return selector ? selector(full) : full;
}

vi.mock("../../stores/linearStore", () => ({
  useLinearStore: (selector?: (s: any) => any) => getStoreValue(selector),
}));

import { IssuePicker } from "./IssuePicker";

beforeEach(() => {
  vi.useFakeTimers();
  storeState = {};
  mockSearchIssues.mockReset();
  mockClearSearch.mockReset();
  mockLoadLinkedIssues.mockReset();
  mockLinkIssue.mockReset().mockResolvedValue(undefined);
  mockUnlinkIssue.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IssuePicker", () => {
  it("renders header", () => {
    render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
    expect(screen.getByText("Link Linear Issue")).toBeInTheDocument();
  });

  it("calls loadLinkedIssues on mount", () => {
    render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
    expect(mockLoadLinkedIssues).toHaveBeenCalledWith("ws-1");
  });

  it("calls clearSearch on unmount", () => {
    const { unmount } = render(
      <IssuePicker workspaceId="ws-1" onClose={vi.fn()} />,
    );
    unmount();
    expect(mockClearSearch).toHaveBeenCalled();
  });

  it("shows search input", () => {
    render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("Search Linear issues..."),
    ).toBeInTheDocument();
  });

  describe("search with debounce", () => {
    it("triggers searchIssues after 300ms debounce", () => {
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "bug fix" } });
      expect(mockSearchIssues).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(mockSearchIssues).toHaveBeenCalledWith("bug fix");
    });

    it("calls clearSearch when input is emptied", () => {
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "test" } });
      mockClearSearch.mockClear();
      fireEvent.change(input, { target: { value: "" } });
      expect(mockClearSearch).toHaveBeenCalled();
    });
  });

  describe("search results display", () => {
    it("shows Searching... when searchLoading is true", () => {
      storeState.searchLoading = true;
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      expect(screen.getByText("Searching...")).toBeInTheDocument();
    });

    it("shows searchError when set", () => {
      storeState.searchError = "API rate limited";
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "test" } });
      expect(screen.getByText("API rate limited")).toBeInTheDocument();
    });

    it("shows No issues found when query exists but results empty", () => {
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "nonexistent" } });
      expect(screen.getByText("No issues found")).toBeInTheDocument();
    });

    it("renders issue results with identifier, title, team, and state", () => {
      storeState.searchResults = [
        {
          id: "i1",
          identifier: "ENG-42",
          title: "Fix login bug",
          url: "https://linear.app/i1",
          teamName: "Engineering",
          stateName: "In Progress",
        },
      ];
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "fix" } });
      expect(screen.getByText("ENG-42")).toBeInTheDocument();
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
      expect(
        screen.getByText("Engineering · In Progress"),
      ).toBeInTheDocument();
    });
  });

  describe("linking", () => {
    it("calls linkIssue when clicking an unlinked search result", async () => {
      storeState.searchResults = [
        {
          id: "i1",
          identifier: "ENG-1",
          title: "Task",
          url: "https://linear.app/i1",
          teamName: "Eng",
          stateName: "Todo",
        },
      ];
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "task" } });
      const resultButton = screen.getByText("Task").closest("button")!;
      await act(async () => {
        fireEvent.click(resultButton);
      });
      expect(mockLinkIssue).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        issueId: "i1",
        identifier: "ENG-1",
        title: "Task",
        url: "https://linear.app/i1",
      });
    });

    it("calls unlinkIssue when clicking an already-linked search result", async () => {
      storeState.searchResults = [
        {
          id: "i1",
          identifier: "ENG-1",
          title: "Task",
          url: "https://linear.app/i1",
          teamName: "Eng",
          stateName: "Todo",
        },
      ];
      storeState.linkedIssues = {
        "ws-1": [
          {
            issueId: "i1",
            identifier: "ENG-1",
            title: "Task",
            url: "https://linear.app/i1",
          },
        ],
      };
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "task" } });
      // Search results are buttons; find all buttons with the issue text
      const buttons = screen.getAllByRole("button").filter(
        (btn) => btn.textContent?.includes("ENG-1") && btn.textContent?.includes("Task") && btn.textContent?.includes("Eng"),
      );
      expect(buttons.length).toBeGreaterThanOrEqual(1);
      await act(async () => {
        fireEvent.click(buttons[0]);
      });
      expect(mockUnlinkIssue).toHaveBeenCalledWith("ws-1", "i1");
    });

    it("shows actionError on link failure", async () => {
      mockLinkIssue.mockRejectedValue(new Error("link failed"));
      storeState.searchResults = [
        {
          id: "i1",
          identifier: "ENG-1",
          title: "Task",
          url: "u",
          teamName: "",
          stateName: "",
        },
      ];
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText("Search Linear issues...");
      fireEvent.change(input, { target: { value: "task" } });
      await act(async () => {
        fireEvent.click(screen.getByText("Task").closest("button")!);
      });
      expect(screen.getByText(/Failed to link ENG-1/)).toBeInTheDocument();
    });
  });

  describe("linked issues section", () => {
    it("renders linked issues with identifier and title", () => {
      storeState.linkedIssues = {
        "ws-1": [
          {
            issueId: "i1",
            identifier: "ENG-5",
            title: "Linked task",
            url: "https://linear.app/i1",
          },
        ],
      };
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      expect(screen.getByText("Linked")).toBeInTheDocument();
      expect(screen.getByText("ENG-5")).toBeInTheDocument();
      expect(screen.getByText("Linked task")).toBeInTheDocument();
    });

    it("does not show Linked section when no linked issues", () => {
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      expect(screen.queryByText("Linked")).not.toBeInTheDocument();
    });

    it("calls unlinkIssue when clicking unlink button", async () => {
      storeState.linkedIssues = {
        "ws-1": [
          {
            issueId: "i1",
            identifier: "ENG-5",
            title: "Linked task",
            url: "https://linear.app/i1",
          },
        ],
      };
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const unlinkBtn = screen.getByTestId("unlink-icon").closest("button")!;
      await act(async () => {
        fireEvent.click(unlinkBtn);
      });
      expect(mockUnlinkIssue).toHaveBeenCalledWith("ws-1", "i1");
    });

    it("shows actionError on unlink failure", async () => {
      mockUnlinkIssue.mockRejectedValue(new Error("unlink failed"));
      storeState.linkedIssues = {
        "ws-1": [
          {
            issueId: "i1",
            identifier: "ENG-5",
            title: "Linked task",
            url: "https://linear.app/i1",
          },
        ],
      };
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const unlinkBtn = screen.getByTestId("unlink-icon").closest("button")!;
      await act(async () => {
        fireEvent.click(unlinkBtn);
      });
      expect(screen.getByText(/Failed to unlink issue/)).toBeInTheDocument();
    });
  });

  describe("close", () => {
    it("calls onClose when backdrop is clicked", () => {
      const onClose = vi.fn();
      render(<IssuePicker workspaceId="ws-1" onClose={onClose} />);
      const backdrop =
        screen.getByText("Link Linear Issue").closest(".fixed")!;
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when X button is clicked", () => {
      const onClose = vi.fn();
      render(<IssuePicker workspaceId="ws-1" onClose={onClose} />);
      const xBtn = screen.getByTestId("x-icon").closest("button")!;
      fireEvent.click(xBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("linked issue actions", () => {
    it("opens issue URL in new tab when external link button is clicked", () => {
      const mockOpen = vi.fn();
      vi.stubGlobal("open", mockOpen);

      storeState.linkedIssues = {
        "ws-1": [
          {
            issueId: "i1",
            identifier: "ENG-5",
            title: "Linked task",
            url: "https://linear.app/team/ENG-5",
          },
        ],
      };
      render(<IssuePicker workspaceId="ws-1" onClose={vi.fn()} />);
      const externalLinkBtn = screen.getByTestId("external-link").closest("button")!;
      fireEvent.click(externalLinkBtn);
      expect(mockOpen).toHaveBeenCalledWith("https://linear.app/team/ENG-5", "_blank");

      vi.unstubAllGlobals();
    });
  });
});
