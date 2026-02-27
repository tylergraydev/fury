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
import { ensureTypesLoaded } from "../lib/monacoSetup";

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
  useFileViewerStore.setState({
    tabs: [],
    activeTabId: null,
    splitActive: false,
    focusedPane: "left",
    leftActiveTabId: null,
    rightActiveTabId: null,
    revealLine: null,
  });
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

  it("detects plaintext for file without extension", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "data",
      language: "plaintext",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "Makefile");

    const tab = useFileViewerStore.getState().tabs[0];
    expect(tab.language).toBe("plaintext");
  });

  it("does not call ensureTypesLoaded for non-TS files", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "fn main() {}",
      language: "rust",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "main.rs");

    await vi.waitFor(() => {
      const tab = useFileViewerStore.getState().tabs[0];
      expect(tab.loading).toBe(false);
    });
    expect(ensureTypesLoaded).not.toHaveBeenCalled();
  });

  it("detects plaintext for unknown file extension", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "data",
      language: "plaintext",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "readme.xyz");

    const tab = useFileViewerStore.getState().tabs[0];
    expect(tab.language).toBe("plaintext");
  });

  it("loads type definitions for TypeScript files", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "const x = 1;",
      language: "typescript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "index.ts");

    // Wait for fetchContent to complete
    await vi.waitFor(() => {
      expect(ensureTypesLoaded).toHaveBeenCalledWith("ws1", "workspace");
    });
  });

  it("loads type definitions for JavaScript files", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "var x = 1;",
      language: "javascript",
    } as any);

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "index.js");

    await vi.waitFor(() => {
      expect(ensureTypesLoaded).toHaveBeenCalledWith("ws1", "workspace");
    });
  });

  it("swallows ensureTypesLoaded rejection for TS files", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "const x = 1;",
      language: "typescript",
    } as any);
    vi.mocked(ensureTypesLoaded).mockRejectedValueOnce(new Error("types fail"));

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "index.ts");

    await vi.waitFor(() => {
      expect(ensureTypesLoaded).toHaveBeenCalledWith("ws1", "workspace");
    });
    // Should not throw or set error - rejection is swallowed by .catch(() => {})
    const tab = useFileViewerStore.getState().tabs[0];
    expect(tab.error).toBeNull();
    expect(tab.content).toBe("const x = 1;");
  });

  it("sets error on fetchContent failure", async () => {
    vi.mocked(readWorkspaceFile).mockRejectedValue(new Error("read fail"));

    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "bad.ts");

    await vi.waitFor(() => {
      const tab = useFileViewerStore.getState().tabs[0];
      expect(tab.loading).toBe(false);
      expect(tab.error).toBe("Error: read fail");
    });
  });

  it("fetchContent error path leaves non-matching tabs unchanged", async () => {
    // First, open a successful file
    vi.mocked(readWorkspaceFile).mockResolvedValueOnce({
      content: "good",
      language: "rust",
    } as any);
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "good.rs", true);

    await vi.waitFor(() => {
      expect(useFileViewerStore.getState().tabs[0].loading).toBe(false);
    });

    // Now open a file that will fail — this triggers fetchContent's error .map
    // over multiple tabs, exercising the ternary false branch (line 120)
    vi.mocked(readWorkspaceFile).mockRejectedValueOnce(
      new Error("read fail"),
    );
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "bad.ts", true);

    await vi.waitFor(() => {
      const tabs = useFileViewerStore.getState().tabs;
      expect(tabs[1].loading).toBe(false);
      expect(tabs[1].error).toBe("Error: read fail");
    });

    // The first tab should be unaffected
    const tabs = useFileViewerStore.getState().tabs;
    expect(tabs[0].content).toBe("good");
    expect(tabs[0].error).toBeNull();
  });

  it("fetchContent success path leaves non-matching tabs unchanged", async () => {
    // First, open a pinned file
    vi.mocked(readWorkspaceFile).mockResolvedValueOnce({
      content: "first",
      language: "rust",
    } as any);
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "first.rs", true);

    await vi.waitFor(() => {
      expect(useFileViewerStore.getState().tabs[0].loading).toBe(false);
    });

    // Open second file — this triggers fetchContent's success .map over
    // multiple tabs, exercising the ternary false branch (line 114)
    vi.mocked(readWorkspaceFile).mockResolvedValueOnce({
      content: "second",
      language: "python",
    } as any);
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "second.py", true);

    await vi.waitFor(() => {
      const tabs = useFileViewerStore.getState().tabs;
      expect(tabs[1].loading).toBe(false);
      expect(tabs[1].content).toBe("second");
    });

    // First tab should be unaffected
    const tabs = useFileViewerStore.getState().tabs;
    expect(tabs[0].content).toBe("first");
    expect(tabs[0].language).toBe("rust");
  });

  it("pins existing tab with multiple tabs (non-matching ternary branch)", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    // Open two files as unpinned
    await useFileViewerStore.getState().openFile("ws1", "workspace", "a.ts", true);
    await useFileViewerStore.getState().openFile("ws1", "workspace", "b.ts");
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
    expect(useFileViewerStore.getState().tabs[1].pinned).toBe(false);

    // Re-open b.ts with pin=true
    await useFileViewerStore.getState().openFile("ws1", "workspace", "b.ts", true);
    // b.ts should now be pinned, a.ts unchanged
    expect(useFileViewerStore.getState().tabs[1].pinned).toBe(true);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
  });

  it("activates existing tab without pinning if already pinned", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    // Open as pinned
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts", true);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);

    // Open again with pin=true - should not duplicate
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "file.ts", true);
    expect(useFileViewerStore.getState().tabs).toHaveLength(1);
    expect(useFileViewerStore.getState().activeTabId).toBe("ws1:file.ts");
  });

  it("adds new preview tab when all existing tabs are pinned", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    // Open a pinned tab
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "pinned.ts", true);
    // Open an unpinned preview - should add new tab (not replace pinned)
    await useFileViewerStore
      .getState()
      .openFile("ws1", "workspace", "preview.ts", false);

    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
    expect(useFileViewerStore.getState().activeTabId).toBe("ws1:preview.ts");
  });
});

describe("fileViewerStore - pinTab", () => {
  it("marks a tab as pinned", () => {
    const tab = makeTab({ pinned: false });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().pinTab(tab.id);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
  });

  it("leaves non-matching tabs unchanged when pinning", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: false });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: false });
    useFileViewerStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
    useFileViewerStore.getState().pinTab(tab1.id);
    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(true);
    expect(useFileViewerStore.getState().tabs[1].pinned).toBe(false);
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

  it("handles closing non-existent tab gracefully", () => {
    const tab = makeTab();
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    useFileViewerStore.getState().closeTab("nonexistent:tab");
    // Should not call notifyDocumentClosed for a tab that doesn't exist
    expect(notifyDocumentClosed).not.toHaveBeenCalled();
    // Original tabs unchanged
    expect(useFileViewerStore.getState().tabs).toHaveLength(1);
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

  it("leaves non-matching tabs unchanged during update", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", content: "original" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", content: "other" });
    useFileViewerStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
    useFileViewerStore.getState().updateContent(tab1.id, "modified");
    expect(useFileViewerStore.getState().tabs[0].editedContent).toBe("modified");
    expect(useFileViewerStore.getState().tabs[1].editedContent).toBeNull();
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

  it("uses content as fallback when editedContent is null", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({
      content: "original",
      language: "typescript",
      formatted: true,
    } as any);

    const tab = makeTab({
      contextType: "workspace",
      contextId: "ws1",
      filePath: "app.ts",
      content: "original",
      editedContent: null,
      dirty: true,
    });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();

    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      "ws1",
      "app.ts",
      "original",
      true,
    );
  });

  it("is a no-op when content is null and editedContent is null", async () => {
    const tab = makeTab({
      content: null,
      editedContent: null,
      dirty: true,
    });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("is a no-op when tab is already saving", async () => {
    const tab = makeTab({
      dirty: true,
      saving: true,
      editedContent: "content",
    });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("calls writeRepoFile for repo context type", async () => {
    vi.mocked(writeRepoFile).mockResolvedValue({
      content: "saved repo content",
      language: "rust",
      formatted: true,
    } as any);

    const tab = makeTab({
      id: "repo1:main.rs",
      contextType: "repo",
      contextId: "repo1",
      filePath: "main.rs",
      content: "original",
      editedContent: "edited",
      dirty: true,
    });
    useFileViewerStore.setState({ tabs: [tab], activeTabId: tab.id });
    await useFileViewerStore.getState().saveActiveFile();

    expect(writeRepoFile).toHaveBeenCalledWith(
      "repo1",
      "main.rs",
      "edited",
      true,
    );
    const savedTab = useFileViewerStore.getState().tabs[0];
    expect(savedTab.content).toBe("saved repo content");
    expect(savedTab.dirty).toBe(false);
    expect(savedTab.saving).toBe(false);
  });

  it("saves active file with multiple tabs (non-matching tabs untouched)", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({
      content: "saved",
      language: "typescript",
      formatted: true,
    } as any);

    const tab1 = makeTab({
      id: "ws1:a.ts",
      filePath: "a.ts",
      contextType: "workspace",
      contextId: "ws1",
      content: "original",
      editedContent: "edited",
      dirty: true,
    });
    const tab2 = makeTab({
      id: "ws1:b.ts",
      filePath: "b.ts",
      content: "other",
    });
    useFileViewerStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
    await useFileViewerStore.getState().saveActiveFile();

    // First tab saved
    expect(useFileViewerStore.getState().tabs[0].dirty).toBe(false);
    expect(useFileViewerStore.getState().tabs[0].content).toBe("saved");
    // Second tab untouched
    expect(useFileViewerStore.getState().tabs[1].content).toBe("other");
  });

  it("save error with multiple tabs leaves non-matching tabs untouched", async () => {
    vi.mocked(writeWorkspaceFile).mockRejectedValue(new Error("fail"));

    const tab1 = makeTab({
      id: "ws1:a.ts",
      filePath: "a.ts",
      contextType: "workspace",
      contextId: "ws1",
      content: "original",
      editedContent: "edited",
      dirty: true,
    });
    const tab2 = makeTab({
      id: "ws1:b.ts",
      filePath: "b.ts",
    });
    useFileViewerStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
    await useFileViewerStore.getState().saveActiveFile();

    expect(useFileViewerStore.getState().tabs[0].error).toContain("Save failed");
    expect(useFileViewerStore.getState().tabs[1].error).toBeNull();
  });

  it("passes formatOnSave=false when specified", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({
      content: "saved",
      language: "typescript",
      formatted: false,
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
    await useFileViewerStore.getState().saveActiveFile(false);

    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      "ws1",
      "app.ts",
      "edited",
      false,
    );
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

describe("fileViewerStore - split editor", () => {
  it("splitEditor activates split mode", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().splitEditor(tab2.id);
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(true);
    expect(state.leftActiveTabId).toBe("ctx1:a.ts");
    expect(state.rightActiveTabId).toBe("ctx1:b.ts");
    expect(state.focusedPane).toBe("right");
  });

  it("splitEditor without tabId sets right pane to null", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    useFileViewerStore.setState({
      tabs: [tab1],
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().splitEditor();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(true);
    expect(state.leftActiveTabId).toBe("ctx1:a.ts");
    expect(state.rightActiveTabId).toBeNull();
  });

  it("splitEditor is a no-op when already split", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      activeTabId: tab1.id,
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
    });

    useFileViewerStore.getState().splitEditor("ctx1:b.ts");
    expect(useFileViewerStore.getState().focusedPane).toBe("left");
  });

  it("closeSplit exits split mode and keeps focused pane tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      activeTabId: tab2.id,
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
    });

    useFileViewerStore.getState().closeSplit();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.activeTabId).toBe("ctx1:b.ts");
    expect(state.leftActiveTabId).toBeNull();
    expect(state.rightActiveTabId).toBeNull();
  });

  it("closeSplit falls back to left tab when focused right has no tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    useFileViewerStore.setState({
      tabs: [tab1],
      activeTabId: null,
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: null,
      focusedPane: "right",
    });

    useFileViewerStore.getState().closeSplit();
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:a.ts");
  });

  it("setFocusedPane updates focusedPane and activeTabId", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    useFileViewerStore.getState().setFocusedPane("left");
    const state = useFileViewerStore.getState();
    expect(state.focusedPane).toBe("left");
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("setActiveTabInPane updates the correct pane", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    const tab3 = makeTab({ id: "ctx1:c.ts", filePath: "c.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2, tab3],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().setActiveTabInPane("right", tab3.id);
    const state = useFileViewerStore.getState();
    expect(state.rightActiveTabId).toBe("ctx1:c.ts");
    // activeTabId should NOT change since focused pane is "left"
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("setActiveTabInPane updates activeTabId when pane is focused", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    const tab3 = makeTab({ id: "ctx1:c.ts", filePath: "c.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2, tab3],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().setActiveTabInPane("left", tab3.id);
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:c.ts");
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:c.ts");
  });

  it("setActiveTab in split mode routes to focused pane", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    const tab3 = makeTab({ id: "ctx1:c.ts", filePath: "c.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2, tab3],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    useFileViewerStore.getState().setActiveTab(tab3.id);
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:c.ts");
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:c.ts");
  });

  it("closeTab in split mode closes split when right pane empties", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    useFileViewerStore.getState().closeTab(tab2.id);
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("closeTab in split mode picks next tab when left pane tab is closed", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    const tab3 = makeTab({ id: "ctx1:c.ts", filePath: "c.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2, tab3],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().closeTab(tab1.id);
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(true);
    // Left pane should pick next available tab (not tab2 which is in right)
    expect(state.leftActiveTabId).toBe("ctx1:c.ts");
  });

  it("showChat in split mode with focused right pane closes split", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    useFileViewerStore.getState().showChat();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("showChat in split mode with focused left pane clears left tab", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts" });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().showChat();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(true);
    expect(state.leftActiveTabId).toBeNull();
    expect(state.activeTabId).toBeNull();
  });

  it("closeAllTabs also closes split", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    useFileViewerStore.setState({
      tabs: [tab1],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: null,
      focusedPane: "left",
    });

    useFileViewerStore.getState().closeAllTabs();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.tabs).toEqual([]);
    expect(state.leftActiveTabId).toBeNull();
    expect(state.rightActiveTabId).toBeNull();
  });

  it("openFile in split mode opens in focused pane", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "content",
      language: "typescript",
    } as any);

    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: true });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: true });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", true);
    const state = useFileViewerStore.getState();
    expect(state.rightActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
    expect(state.leftActiveTabId).toBe("ctx1:a.ts");
  });
});
