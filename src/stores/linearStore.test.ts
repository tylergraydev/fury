import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/tauri", () => ({
  searchLinearIssues: vi.fn(),
  linkIssueToWorkspace: vi.fn(),
  unlinkIssueFromWorkspace: vi.fn(),
  getWorkspaceIssues: vi.fn(),
}));

import { useLinearStore } from "./linearStore";
import {
  searchLinearIssues,
  linkIssueToWorkspace,
  unlinkIssueFromWorkspace,
  getWorkspaceIssues,
} from "../lib/tauri";

const mockSearch = vi.mocked(searchLinearIssues);
const mockLink = vi.mocked(linkIssueToWorkspace);
const mockUnlink = vi.mocked(unlinkIssueFromWorkspace);
const mockGetIssues = vi.mocked(getWorkspaceIssues);

beforeEach(() => {
  useLinearStore.setState({
    searchResults: [],
    searchLoading: false,
    searchError: null,
    linkedIssues: {},
    loading: {},
  });
  vi.clearAllMocks();
});

describe("searchIssues", () => {
  it("sets searchLoading during search", async () => {
    mockSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          expect(useLinearStore.getState().searchLoading).toBe(true);
          resolve([]);
        }),
    );
    await useLinearStore.getState().searchIssues("test");
  });

  it("populates searchResults on success", async () => {
    const issues = [{ id: "1", identifier: "ENG-1", title: "Fix bug" }];
    mockSearch.mockResolvedValue(issues as any);
    await useLinearStore.getState().searchIssues("bug");
    expect(useLinearStore.getState().searchResults).toEqual(issues);
    expect(useLinearStore.getState().searchLoading).toBe(false);
  });

  it("sets searchError on failure", async () => {
    mockSearch.mockRejectedValue(new Error("network fail"));
    await useLinearStore.getState().searchIssues("test");
    expect(useLinearStore.getState().searchError).toBe("Error: network fail");
    expect(useLinearStore.getState().searchLoading).toBe(false);
  });
});

describe("clearSearch", () => {
  it("resets searchResults and searchError", () => {
    useLinearStore.setState({
      searchResults: [{ id: "1" }] as any,
      searchError: "old error",
    });
    useLinearStore.getState().clearSearch();
    expect(useLinearStore.getState().searchResults).toEqual([]);
    expect(useLinearStore.getState().searchError).toBeNull();
  });
});

describe("loadLinkedIssues", () => {
  it("sets loading for workspace during load", async () => {
    mockGetIssues.mockImplementation(
      () =>
        new Promise((resolve) => {
          expect(useLinearStore.getState().loading["ws-1"]).toBe(true);
          resolve([]);
        }),
    );
    await useLinearStore.getState().loadLinkedIssues("ws-1");
  });

  it("populates linkedIssues on success", async () => {
    const issues = [{ issueId: "i1", identifier: "ENG-1", title: "task" }];
    mockGetIssues.mockResolvedValue(issues as any);
    await useLinearStore.getState().loadLinkedIssues("ws-1");
    expect(useLinearStore.getState().linkedIssues["ws-1"]).toEqual(issues);
    expect(useLinearStore.getState().loading["ws-1"]).toBe(false);
  });

  it("logs error and clears loading on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetIssues.mockRejectedValue(new Error("fail"));
    await useLinearStore.getState().loadLinkedIssues("ws-1");
    expect(useLinearStore.getState().loading["ws-1"]).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      "Failed to load linked issues:",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("deduplicates concurrent calls for the same workspace", async () => {
    let resolveFirst: (v: any) => void;
    mockGetIssues.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const p1 = useLinearStore.getState().loadLinkedIssues("ws-1");
    const p2 = useLinearStore.getState().loadLinkedIssues("ws-1");
    resolveFirst!([]);
    await Promise.all([p1, p2]);
    expect(mockGetIssues).toHaveBeenCalledTimes(1);
  });

  it("allows new call after previous completes", async () => {
    mockGetIssues.mockResolvedValue([]);
    await useLinearStore.getState().loadLinkedIssues("ws-1");
    await useLinearStore.getState().loadLinkedIssues("ws-1");
    expect(mockGetIssues).toHaveBeenCalledTimes(2);
  });
});

describe("linkIssue", () => {
  it("calls linkIssueCmd and refreshes linked issues", async () => {
    mockLink.mockResolvedValue(undefined as any);
    mockGetIssues.mockResolvedValue([]);
    const request = {
      workspaceId: "ws-1",
      issueId: "i1",
      identifier: "ENG-1",
      title: "task",
      url: "https://linear.app/issue/ENG-1",
    };
    await useLinearStore.getState().linkIssue(request);
    expect(mockLink).toHaveBeenCalledWith(request);
    expect(mockGetIssues).toHaveBeenCalledWith("ws-1");
  });

  it("logs error if refresh fails after linking", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLink.mockResolvedValue(undefined as any);
    mockGetIssues.mockRejectedValue(new Error("refresh fail"));
    await useLinearStore.getState().linkIssue({
      workspaceId: "ws-1",
      issueId: "i1",
      identifier: "ENG-1",
      title: "t",
      url: "u",
    });
    // Error is caught inside loadLinkedIssues, so the outer catch in linkIssue
    // never fires. The logged message comes from loadLinkedIssues.
    expect(spy).toHaveBeenCalledWith(
      "Failed to load linked issues:",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("propagates linkIssueCmd rejection", async () => {
    mockLink.mockRejectedValue(new Error("link failed"));
    await expect(
      useLinearStore.getState().linkIssue({
        workspaceId: "ws-1",
        issueId: "i1",
        identifier: "ENG-1",
        title: "t",
        url: "u",
      }),
    ).rejects.toThrow("link failed");
  });
});

describe("unlinkIssue", () => {
  it("calls unlinkIssueCmd and refreshes linked issues", async () => {
    mockUnlink.mockResolvedValue(undefined as any);
    mockGetIssues.mockResolvedValue([]);
    await useLinearStore.getState().unlinkIssue("ws-1", "i1");
    expect(mockUnlink).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      issueId: "i1",
    });
    expect(mockGetIssues).toHaveBeenCalledWith("ws-1");
  });

  it("logs error if refresh fails after unlinking", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUnlink.mockResolvedValue(undefined as any);
    mockGetIssues.mockRejectedValue(new Error("refresh fail"));
    await useLinearStore.getState().unlinkIssue("ws-1", "i1");
    // Error is caught inside loadLinkedIssues, so the outer catch in unlinkIssue
    // never fires. The logged message comes from loadLinkedIssues.
    expect(spy).toHaveBeenCalledWith(
      "Failed to load linked issues:",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("propagates unlinkIssueCmd rejection", async () => {
    mockUnlink.mockRejectedValue(new Error("unlink failed"));
    await expect(
      useLinearStore.getState().unlinkIssue("ws-1", "i1"),
    ).rejects.toThrow("unlink failed");
  });
});
