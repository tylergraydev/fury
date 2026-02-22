import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  readWorkspaceFile: vi.fn(),
  readRepoFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  writeRepoFile: vi.fn(),
}));

vi.mock("../lib/copilot", () => ({
  notifyDocumentClosed: vi.fn(),
}));

vi.mock("../lib/monacoSetup", () => ({
  ensureTypesLoaded: vi.fn().mockResolvedValue(undefined),
}));

import { useFileViewerStore, type FileTab } from "./fileViewerStore";
import {
  readWorkspaceFile,
  readRepoFile,
  writeWorkspaceFile,
  writeRepoFile,
} from "../lib/tauri";
import { notifyDocumentClosed } from "../lib/copilot";

function makeTab(overrides: Partial<FileTab> = {}): FileTab {
  return {
    id: "ctx1:src/main.ts",
    filePath: "src/main.ts",
    contextId: "ctx1",
    contextType: "workspace",
    content: "original content",
    editedContent: null,
    language: "typescript",
    loading: false,
    saving: false,
    error: null,
    pinned: false,
    dirty: false,
    ...overrides,
  };
}

beforeEach(() => {
  useFileViewerStore.setState({ tabs: [], activeTabId: null });
  vi.clearAllMocks();
});

describe("fileViewerStore - initial state", () => {
  it("starts with empty tabs", () => {
    expect(useFileViewerStore.getState().tabs).toEqual([]);
  });

  it("starts with null activeTabId", () => {
    expect(useFileViewerStore.getState().activeTabId).toBeNull();
  });
});

describe("fileViewerStore - openFile", () => {
  it("creates a new tab and activates it", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "hello",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "src/app.ts");

    const { tabs, activeTabId } = useFileViewerStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe("ws1:src/app.ts");
    expect(activeTabId).toBe("ws1:src/app.ts");
  });

  it("activates existing tab instead of creating duplicate", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts", true);
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "other.ts", true);
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts");
    expect(useFileViewerStore.getState().activeTabId).toBe("ws1:file.ts");
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
  });

  it("pins tab when re-opening with pin=true", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts");
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(false);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts", true);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
  });

  it("replaces unpinned preview tab when opening new unpinned file", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "first.ts");
    expect(useFileViewerStore.getState().tabs).toHaveLength(1);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "second.ts");
    const { tabs } = useFileViewerStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe("ws1:second.ts");
  });

  it("adds new tab when all existing are pinned", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "pinned.ts", true);
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "preview.ts");
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
  });

  it("calls readRepoFile for repo context type", async () => {
    vi.mocked(readRepoFile).mockResolvedValue({
      content: "rust",
      language: "rust",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("repo1", "repo", "src/main.rs");

    expect(readRepoFile).toHaveBeenCalledWith("repo1", "src/main.rs");
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("fileViewerStore - pinTab", () => {
  it("marks a tab as pinned", () => {
    const tab = makeTab({ pinned: false });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().pinTab(tab.id);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
  });
});

describe("fileViewerStore - closeTab", () => {
  it("removes the tab", () => {
    const tab = makeTab();
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().closeTab(tab.id);
    expect(useFileViewerStore.getState().tabs).toHaveLength(0);
  });

  it("sets activeTabId to null when closing the last tab", () => {
    const tab = makeTab();
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().closeTab(tab.id);
    expect(useFileViewerStore.getState().activeTabId).toBeNull();
  });

  it("activates next tab when closing active tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    const tab3 = makeTab({ id: "ctx1:c.ts", filePath: "c.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2, tab3],
      activeTabId: tab2.id,
    });
    useFileViewerStore.getState().closeTab(tab2.id);
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:c.ts");
  });

  it("does not change activeTabId when closing non-active tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      activeTabId: tab2.id,
    });
    useFileViewerStore.getState().closeTab(tab1.id);
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:b.ts");
  });

  it("calls notifyDocumentClosed", () => {
    const tab = makeTab({ filePath: "src/index.ts" });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().closeTab(tab.id);
    expect(notifyDocumentClosed).toHaveBeenCalledWith("src/index.ts");
  });
});

describe("fileViewerStore - updateContent", () => {
  it("sets editedContent and dirty=true", () => {
    const tab = makeTab({ content: "original" });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().updateContent(tab.id, "modified");
    expect(useFileViewerStore.getState().tabs[0].editedContent).toBe(
      "modified",
    );
    expect(useFileViewerStore.getState().tabs[0].dirty).toBe(true);
  });

  it("sets dirty=false when content matches original", () => {
    const tab = makeTab({ content: "same" });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().updateContent(tab.id, "same");
    expect(useFileViewerStore.getState().tabs[0].dirty).toBe(false);
  });

  it("auto-pins the tab on edit", () => {
    const tab = makeTab({ pinned: false });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().updateContent(tab.id, "new");
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
  });
});

describe("fileViewerStore - saveActiveFile", () => {
  it("calls writeWorkspaceFile and clears dirty", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({
      content: "saved",
      language: "typescript",
      formatted: true,
    } as any);

    const tab = makeTab({
      contextType: "workspace",
      contextId: "ws1",
      filePath: "app.ts",
      content: "original",
      editedContent: "edited",
      dirty: true,
    });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();

    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      "ws1",
      "app.ts",
      "edited",
      true,
    );
    const savedTab = useFileViewerStore.getState().tabs[0];
    expect(savedTab.dirty).toBe(false);
    expect(savedTab.content).toBe("saved");
    expect(savedTab.saving).toBe(false);
  });

  it("sets error on save failure", async () => {
    vi.mocked(writeWorkspaceFile).mockRejectedValue(
      new Error("Permission denied"),
    );
    const tab = makeTab({ content: "orig", editedContent: "edit", dirty: true });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();
    const savedTab = useFileViewerStore.getState().tabs[0];
    expect(savedTab.error).toBe("Save failed: Error: Permission denied");
    expect(savedTab.saving).toBe(false);
  });

  it("is a no-op when tab is not dirty", async () => {
    const tab = makeTab({ dirty: false });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("is a no-op when no tab is active", async () => {
    useFileViewerStore.setState({ tabs: [], activeTabId: null });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("fileViewerStore - closeAllTabs / showChat / setActiveTab", () => {
  it("closeAllTabs removes all tabs", () => {
    const tab = makeTab();
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().closeAllTabs();
    expect(useFileViewerStore.getState().tabs).toEqual([]);
    expect(useFileViewerStore.getState().activeTabId).toBeNull();
  });

  it("showChat sets activeTabId to null", () => {
    const tab = makeTab();
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().showChat();
    expect(useFileViewerStore.getState().activeTabId).toBeNull();
    expect(useFileViewerStore.getState().tabs).toHaveLength(1);
  });

  it("setActiveTab changes active tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      activeTabId: tab1.id,
    });
    useFileViewerStore.getState().setActiveTab(tab2.id);
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:b.ts");
  });
});
