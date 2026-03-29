import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectLanguage } from "./fileViewerStore";

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

  it("setActiveTab in split mode routes to left pane when focused", () => {
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

    useFileViewerStore.getState().setActiveTab(tab3.id);
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:c.ts");
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:c.ts");
  });

  it("showChat in split mode with left focused and right null closes split", () => {
    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts" });
    useFileViewerStore.setState({
      tabs: [tab1],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: null,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    useFileViewerStore.getState().showChat();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.activeTabId).toBeNull();
  });

  it("setRevealLine and clearRevealLine", () => {
    useFileViewerStore.getState().setRevealLine("tab-1", 42);
    expect(useFileViewerStore.getState().revealLine).toEqual({ tabId: "tab-1", line: 42 });
    useFileViewerStore.getState().clearRevealLine();
    expect(useFileViewerStore.getState().revealLine).toBeNull();
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

  it("openFile in split mode opens pinned tab in left pane when focused", async () => {
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
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", true);
    const state = useFileViewerStore.getState();
    expect(state.leftActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
    expect(state.rightActiveTabId).toBe("ctx1:b.ts");
  });

  it("openFile re-opens existing tab in split mode with left pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: true });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: true });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "b.ts");
    const state = useFileViewerStore.getState();
    expect(state.leftActiveTabId).toBe("ctx1:b.ts");
    expect(state.activeTabId).toBe("ctx1:b.ts");
  });

  it("openFile re-opens existing tab in split mode with right pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
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

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "a.ts");
    const state = useFileViewerStore.getState();
    expect(state.rightActiveTabId).toBe("ctx1:a.ts");
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("openFile preview tab in split mode with left pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: true });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: true });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    // Open unpinned preview - all existing are pinned so it adds a new tab
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", false);
    const state = useFileViewerStore.getState();
    expect(state.leftActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
    expect(state.rightActiveTabId).toBe("ctx1:b.ts");
  });

  it("openFile preview tab in split mode with right pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
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

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", false);
    const state = useFileViewerStore.getState();
    expect(state.rightActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
    expect(state.leftActiveTabId).toBe("ctx1:a.ts");
  });

  it("openFile replaces preview tab in split mode with left pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: true });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: false });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "left",
      activeTabId: tab1.id,
    });

    // Opens preview - replaces existing unpinned tab
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", false);
    const state = useFileViewerStore.getState();
    expect(state.leftActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
  });

  it("openFile replaces preview tab in split mode with right pane focused", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "c",
      language: "typescript",
    } as any);

    const tab1 = makeTab({ id: "ctx1:a.ts", filePath: "a.ts", pinned: true });
    const tab2 = makeTab({ id: "ctx1:b.ts", filePath: "b.ts", pinned: false });
    useFileViewerStore.setState({
      tabs: [tab1, tab2],
      splitActive: true,
      leftActiveTabId: tab1.id,
      rightActiveTabId: tab2.id,
      focusedPane: "right",
      activeTabId: tab2.id,
    });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "c.ts", false);
    const state = useFileViewerStore.getState();
    expect(state.rightActiveTabId).toBe("ctx1:c.ts");
    expect(state.activeTabId).toBe("ctx1:c.ts");
  });

  it("closeTab in split mode picks next for right pane and stays split", () => {
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

    useFileViewerStore.getState().closeTab(tab2.id);
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(true);
    // Right pane picks next tab (not tab1 which is in left)
    expect(state.rightActiveTabId).toBe("ctx1:c.ts");
    // activeTabId should be right since focused is right
    expect(state.activeTabId).toBe("ctx1:c.ts");
  });

  it("closeSplit keeps left pane tab when focused left", () => {
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

    useFileViewerStore.getState().closeSplit();
    const state = useFileViewerStore.getState();
    expect(state.splitActive).toBe(false);
    expect(state.activeTabId).toBe("ctx1:a.ts");
  });

  it("setFocusedPane to right updates activeTabId to right pane tab", () => {
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

    useFileViewerStore.getState().setFocusedPane("right");
    const state = useFileViewerStore.getState();
    expect(state.focusedPane).toBe("right");
    expect(state.activeTabId).toBe("ctx1:b.ts");
  });
});

// ─── Mutation-killing tests: detectLanguage ─────────────────────────────

describe("fileViewerStore - tab creation defaults", () => {
  it("new tab starts with dirty=false after content loads", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "hello", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "test.ts", true);

    await vi.waitFor(() => {
      const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "test.ts");
      expect(tab!.dirty).toBe(false);
    });
  });

  it("new tab starts with loading=true then loading=false", async () => {
    let resolveLoad: (v: any) => void;
    vi.mocked(readWorkspaceFile).mockImplementation(() => new Promise(r => { resolveLoad = r; }));

    const promise = useFileViewerStore.getState().openFile("ctx1", "workspace", "loading.ts", true);
    const tabBefore = useFileViewerStore.getState().tabs.find(t => t.filePath === "loading.ts");
    expect(tabBefore!.loading).toBe(true);

    resolveLoad!({ content: "done", language: "typescript" });
    await promise;

    await vi.waitFor(() => {
      const tabAfter = useFileViewerStore.getState().tabs.find(t => t.filePath === "loading.ts");
      expect(tabAfter!.loading).toBe(false);
    });
  });

  it("new tab starts with saving=false", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "saving.ts", true);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "saving.ts");
    expect(tab!.saving).toBe(false);
  });

  it("new tab starts with error=null", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "err.ts", true);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "err.ts");
    expect(tab!.error).toBeNull();
  });

  it("new tab starts with content=null and editedContent=null", async () => {
    let resolveLoad: (v: any) => void;
    vi.mocked(readWorkspaceFile).mockImplementation(() => new Promise(r => { resolveLoad = r; }));

    useFileViewerStore.getState().openFile("ctx1", "workspace", "null.ts", true);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "null.ts");
    expect(tab!.content).toBeNull();
    expect(tab!.editedContent).toBeNull();

    resolveLoad!({ content: "loaded", language: "typescript" });
  });
});

describe("fileViewerStore - openFile pin/reuse edge cases", () => {
  it("re-opening existing tab without pin does NOT pin it", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    // Open unpinned
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "reuse.ts", false);
    const before = useFileViewerStore.getState().tabs.find(t => t.filePath === "reuse.ts");
    expect(before!.pinned).toBe(false);

    // Re-open without pin — should still be unpinned
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "reuse.ts", false);
    const after = useFileViewerStore.getState().tabs.find(t => t.filePath === "reuse.ts");
    expect(after!.pinned).toBe(false);
  });

  it("re-opening existing unpinned tab with pin=true pins it", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "pin-me.ts", false);
    expect(useFileViewerStore.getState().tabs.find(t => t.filePath === "pin-me.ts")!.pinned).toBe(false);

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "pin-me.ts", true);
    expect(useFileViewerStore.getState().tabs.find(t => t.filePath === "pin-me.ts")!.pinned).toBe(true);
  });

  it("new pinned tab sets pinned=true", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new-pinned.ts", true);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "new-pinned.ts");
    expect(tab!.pinned).toBe(true);
  });

  it("new unpinned tab sets pinned=false", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new-preview.ts", false);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "new-preview.ts");
    expect(tab!.pinned).toBe(false);
  });
});

describe("fileViewerStore - openFile split mode pane routing", () => {
  beforeEach(() => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
  });

  it("existing tab in split mode updates leftActiveTabId when left focused", async () => {
    const tab = { id: "ctx1:exist.ts", filePath: "exist.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], splitActive: true, focusedPane: "left", leftActiveTabId: null, rightActiveTabId: null });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "exist.ts", false);
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:exist.ts");
  });

  it("existing tab in split mode updates rightActiveTabId when right focused", async () => {
    const tab = { id: "ctx1:exist.ts", filePath: "exist.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], splitActive: true, focusedPane: "right", leftActiveTabId: null, rightActiveTabId: null });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "exist.ts", false);
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:exist.ts");
  });

  it("new pinned tab in split mode sets pane ID for left focus", async () => {
    useFileViewerStore.setState({ tabs: [], splitActive: true, focusedPane: "left", leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new-split.ts", true);
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:new-split.ts");
  });

  it("new preview tab in split mode sets pane ID for right focus", async () => {
    useFileViewerStore.setState({ tabs: [], splitActive: true, focusedPane: "right", leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "preview-split.ts", false);
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:preview-split.ts");
  });

  it("preview tab replaces existing unpinned tab", async () => {
    const preview = { id: "ctx1:old.ts", filePath: "old.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [preview] });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new.ts", false);
    const tabs = useFileViewerStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].filePath).toBe("new.ts");
  });
});

describe("fileViewerStore - splitEditor sets left tab from active", () => {
  it("leftActiveTabId equals the current activeTabId before split", () => {
    const tab = { id: "ctx1:before.ts", filePath: "before.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:before.ts" });
    useFileViewerStore.getState().splitEditor();
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:before.ts");
  });

  it("closeSplit with left focus keeps leftActiveTabId as active", () => {
    useFileViewerStore.setState({
      splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:left.ts", rightActiveTabId: "ctx1:right.ts",
      tabs: [
        { id: "ctx1:left.ts", filePath: "left.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false },
        { id: "ctx1:right.ts", filePath: "right.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false },
      ],
    });
    useFileViewerStore.getState().closeSplit();
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:left.ts");
    expect(useFileViewerStore.getState().splitActive).toBe(false);
    expect(useFileViewerStore.getState().focusedPane).toBe("left");
  });

  it("closeSplit with right focus keeps rightActiveTabId as active", () => {
    useFileViewerStore.setState({
      splitActive: true, focusedPane: "right",
      leftActiveTabId: "ctx1:left.ts", rightActiveTabId: "ctx1:right.ts",
      tabs: [
        { id: "ctx1:left.ts", filePath: "left.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false },
        { id: "ctx1:right.ts", filePath: "right.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false },
      ],
    });
    useFileViewerStore.getState().closeSplit();
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:right.ts");
  });
});

describe("fileViewerStore - closeTab next tab selection", () => {
  it("selects previous tab by index when closing non-last active", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t3 = { id: "ctx1:c.ts", filePath: "c.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [t1, t2, t3], activeTabId: "ctx1:b.ts" });

    useFileViewerStore.getState().closeTab("ctx1:b.ts");
    // Should select the tab at the same index or previous
    const active = useFileViewerStore.getState().activeTabId;
    expect(active).not.toBe("ctx1:b.ts");
    expect(active).toBeTruthy();
  });
});

describe("fileViewerStore - saveActiveFile edge cases", () => {
  it("save uses editedContent when available", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({ content: "saved", language: "typescript", formatted: true } as any);
    useFileViewerStore.setState({
      tabs: [{
        id: "ctx1:save.ts", filePath: "save.ts", contextId: "ctx1", contextType: "workspace",
        content: "original", editedContent: "modified", language: "typescript",
        loading: false, saving: false, error: null, pinned: true, dirty: true,
      }],
      activeTabId: "ctx1:save.ts",
    });

    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).toHaveBeenCalledWith("ctx1", "save.ts", "modified", true);
  });

  it("save falls back to content when editedContent is null", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({ content: "saved", language: "typescript", formatted: true } as any);
    useFileViewerStore.setState({
      tabs: [{
        id: "ctx1:fallback.ts", filePath: "fallback.ts", contextId: "ctx1", contextType: "workspace",
        content: "original", editedContent: null, language: "typescript",
        loading: false, saving: false, error: null, pinned: true, dirty: true,
      }],
      activeTabId: "ctx1:fallback.ts",
    });

    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).toHaveBeenCalledWith("ctx1", "fallback.ts", "original", true);
  });
});

describe("fileViewerStore - openFile non-split does NOT set pane IDs", () => {
  it("openFile without split active does not set leftActiveTabId", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    useFileViewerStore.setState({ splitActive: false, leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "nosplit.ts", true);
    expect(useFileViewerStore.getState().leftActiveTabId).toBeNull();
    expect(useFileViewerStore.getState().rightActiveTabId).toBeNull();
  });
});

describe("fileViewerStore - closeTab split mode pane updates", () => {
  it("closing left pane tab in split updates leftActiveTabId to next available", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t3 = { id: "ctx1:c.ts", filePath: "c.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2, t3], splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:c.ts", activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().closeTab("ctx1:a.ts");
    // leftActiveTabId should be updated to another tab (not the right pane's tab)
    const left = useFileViewerStore.getState().leftActiveTabId;
    expect(left).not.toBe("ctx1:a.ts");
    expect(left).not.toBe("ctx1:c.ts"); // Should not steal from right pane
  });

  it("closing right pane tab when no other tabs closes split", () => {
    const t1 = { id: "ctx1:left.ts", filePath: "left.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:right.ts", filePath: "right.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2], splitActive: true, focusedPane: "right",
      leftActiveTabId: "ctx1:left.ts", rightActiveTabId: "ctx1:right.ts", activeTabId: "ctx1:right.ts",
    });
    useFileViewerStore.getState().closeTab("ctx1:right.ts");
    // With only left tab remaining, split should close
    expect(useFileViewerStore.getState().splitActive).toBe(false);
  });
});

describe("fileViewerStore - setActiveTab and showChat in split mode", () => {
  it("setActiveTab routes to right pane when right is focused", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2], splitActive: true, focusedPane: "right",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:a.ts", activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().setActiveTab("ctx1:b.ts");
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:b.ts");
  });

  it("showChat in split with right focus closes split", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1], splitActive: true, focusedPane: "right",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: null, activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().showChat();
    expect(useFileViewerStore.getState().splitActive).toBe(false);
  });
});

describe("fileViewerStore - saveActiveFile conditional branches", () => {
  it("save is no-op when active tab not found", async () => {
    useFileViewerStore.setState({ tabs: [], activeTabId: "nonexistent" });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("save updates saving state during write", async () => {
    let resolveWrite!: (v: any) => void;
    vi.mocked(writeWorkspaceFile).mockImplementation(() => new Promise(r => { resolveWrite = r; }));
    const tab = { id: "ctx1:save.ts", filePath: "save.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "orig", editedContent: "edited", language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: true };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:save.ts" });

    const p = useFileViewerStore.getState().saveActiveFile();
    // During save, saving should be true
    expect(useFileViewerStore.getState().tabs[0].saving).toBe(true);

    resolveWrite({ content: "edited", language: "typescript", formatted: true });
    await p;
    expect(useFileViewerStore.getState().tabs[0].saving).toBe(false);
  });

  it("save matches tab by id (non-matching tabs untouched during save state)", async () => {
    vi.mocked(writeWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript", formatted: true } as any);
    const tab1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: "y", language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: true };
    const tab2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab1, tab2], activeTabId: "ctx1:a.ts" });

    await useFileViewerStore.getState().saveActiveFile();
    // tab2 should not have been modified
    expect(useFileViewerStore.getState().tabs[1].dirty).toBe(false);
    expect(useFileViewerStore.getState().tabs[1].saving).toBe(false);
  });
});

describe("fileViewerStore - openFile pin only targets specific tab", () => {
  it("re-opening with pin=true only pins the target tab, not others", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    // Create two unpinned tabs
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [t1, t2], activeTabId: "ctx1:a.ts" });

    // Re-open a.ts with pin=true
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "a.ts", true);

    const tabs = useFileViewerStore.getState().tabs;
    // a.ts should be pinned
    expect(tabs.find(t => t.id === "ctx1:a.ts")!.pinned).toBe(true);
    // b.ts should still be unpinned
    expect(tabs.find(t => t.id === "ctx1:b.ts")!.pinned).toBe(false);
  });

  it("re-opening already pinned tab with pin=true does NOT remap tabs", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const pinned = { id: "ctx1:pinned.ts", filePath: "pinned.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const other = { id: "ctx1:other.ts", filePath: "other.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [pinned, other], activeTabId: "ctx1:other.ts" });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "pinned.ts", true);

    // Already pinned → pin && !existing.pinned is false → tabs should NOT be remapped
    // other.ts should still be unpinned (not affected by the remap)
    expect(useFileViewerStore.getState().tabs.find(t => t.id === "ctx1:other.ts")!.pinned).toBe(false);
  });

  it("openFile with pin=false and unpinned existing tab does NOT pin", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const t = { id: "ctx1:unpin.ts", filePath: "unpin.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [t], activeTabId: "ctx1:unpin.ts" });

    await useFileViewerStore.getState().openFile("ctx1", "workspace", "unpin.ts", false);

    expect(useFileViewerStore.getState().tabs[0].pinned).toBe(false);
  });
});

describe("fileViewerStore - openFile new tab pin vs preview in non-split", () => {
  it("new file with pin=false creates unpinned tab (pinned field is false, not true)", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    useFileViewerStore.setState({ tabs: [], splitActive: false });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "preview.ts", false);
    const tab = useFileViewerStore.getState().tabs.find(t => t.filePath === "preview.ts");
    expect(tab!.pinned).toBe(false);
    // Verify it's exactly false, not just falsy
    expect(tab!.pinned).not.toBe(true);
  });

  it("new file with pin=true enters pin branch (adds tab, not replaces)", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const existing = { id: "ctx1:existing.ts", filePath: "existing.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [existing], splitActive: false });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new-pin.ts", true);
    // Should have 2 tabs (pinned tab added, not replaced)
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
    expect(useFileViewerStore.getState().tabs.find(t => t.filePath === "new-pin.ts")!.pinned).toBe(true);
  });

  it("new file with pin=false replaces existing unpinned tab", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const existing = { id: "ctx1:old-preview.ts", filePath: "old-preview.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [existing], splitActive: false });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new-preview.ts", false);
    // Should still have 1 tab (replaced, not added)
    expect(useFileViewerStore.getState().tabs).toHaveLength(1);
    expect(useFileViewerStore.getState().tabs[0].filePath).toBe("new-preview.ts");
  });

  it("new file with pin=false adds when all existing are pinned", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const pinned = { id: "ctx1:pinned.ts", filePath: "pinned.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [pinned], splitActive: false });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "no-replace.ts", false);
    // No unpinned preview to replace → adds new tab
    expect(useFileViewerStore.getState().tabs).toHaveLength(2);
  });
});

describe("fileViewerStore - openFile pin in split mode sets pane", () => {
  it("new pinned file in split left-focused sets leftActiveTabId", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    useFileViewerStore.setState({ tabs: [], splitActive: true, focusedPane: "left", leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "pin-left.ts", true);
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:pin-left.ts");
    expect(useFileViewerStore.getState().rightActiveTabId).toBeNull();
  });

  it("new pinned file in split right-focused sets rightActiveTabId", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    useFileViewerStore.setState({ tabs: [], splitActive: true, focusedPane: "right", leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "pin-right.ts", true);
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:pin-right.ts");
    expect(useFileViewerStore.getState().leftActiveTabId).toBeNull();
  });
});

describe("fileViewerStore - openFile preview in split mode sets pane", () => {
  it("new preview file in split left-focused sets leftActiveTabId", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    useFileViewerStore.setState({ tabs: [], splitActive: true, focusedPane: "left", leftActiveTabId: null, rightActiveTabId: null });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "prev-left.ts", false);
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:prev-left.ts");
  });

  it("replacing preview tab in split preserves pane assignment", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({ content: "x", language: "typescript" } as any);
    const preview = { id: "ctx1:old.ts", filePath: "old.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: false, dirty: false };
    useFileViewerStore.setState({ tabs: [preview], splitActive: true, focusedPane: "right", leftActiveTabId: null, rightActiveTabId: "ctx1:old.ts" });
    await useFileViewerStore.getState().openFile("ctx1", "workspace", "new.ts", false);
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:new.ts");
  });
});

describe("fileViewerStore - closeTab split pane updates", () => {
  it("closing left pane tab picks next excluding right pane tab", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t3 = { id: "ctx1:c.ts", filePath: "c.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2, t3], splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:c.ts", activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().closeTab("ctx1:a.ts");
    const left = useFileViewerStore.getState().leftActiveTabId;
    expect(left).toBe("ctx1:b.ts"); // Picks b, not c (c is in right pane)
  });

  it("closing right pane tab picks next from remaining tabs", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t3 = { id: "ctx1:c.ts", filePath: "c.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2, t3], splitActive: true, focusedPane: "right",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:c.ts", activeTabId: "ctx1:c.ts",
    });
    useFileViewerStore.getState().closeTab("ctx1:c.ts");
    const right = useFileViewerStore.getState().rightActiveTabId;
    // Should pick b.ts (not a.ts which is in left)
    expect(right).toBe("ctx1:b.ts");
  });

  it("activeTabId follows focused pane after close", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t3 = { id: "ctx1:c.ts", filePath: "c.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2, t3], splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:c.ts", activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().closeTab("ctx1:a.ts");
    // Focused pane is left, so activeTabId should match new leftActiveTabId
    expect(useFileViewerStore.getState().activeTabId).toBe(useFileViewerStore.getState().leftActiveTabId);
  });

  it("closing last tab in single-pane selects by Math.min(idx, length-1)", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [t1, t2], activeTabId: "ctx1:b.ts", splitActive: false });
    // Close the last tab (index 1) — Math.min(1, 0) = 0, selects t1
    useFileViewerStore.getState().closeTab("ctx1:b.ts");
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:a.ts");
  });
});

describe("fileViewerStore - setActiveTab/showChat split mode routing", () => {
  it("setActiveTab in split left-focused sets leftActiveTabId", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    const t2 = { id: "ctx1:b.ts", filePath: "b.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1, t2], splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: "ctx1:b.ts", activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().setActiveTab("ctx1:b.ts");
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:b.ts");
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:b.ts");
  });

  it("showChat in split left-focused clears left tab", () => {
    const t1 = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({
      tabs: [t1], splitActive: true, focusedPane: "left",
      leftActiveTabId: "ctx1:a.ts", rightActiveTabId: null, activeTabId: "ctx1:a.ts",
    });
    useFileViewerStore.getState().showChat();
    expect(useFileViewerStore.getState().leftActiveTabId).toBeNull();
  });
});

describe("fileViewerStore - showChat and closeAllTabs reset focusedPane", () => {
  it("showChat in split with left focus resets focusedPane to 'left'", () => {
    const tab = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const, content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], splitActive: true, focusedPane: "left", leftActiveTabId: "ctx1:a.ts", rightActiveTabId: null });
    useFileViewerStore.getState().showChat();
    expect(useFileViewerStore.getState().focusedPane).toBe("left");
  });

  it("closeAllTabs resets focusedPane to 'left'", () => {
    useFileViewerStore.setState({ focusedPane: "right", splitActive: true });
    useFileViewerStore.getState().closeAllTabs();
    expect(useFileViewerStore.getState().focusedPane).toBe("left");
    expect(useFileViewerStore.getState().splitActive).toBe(false);
  });
});

describe("fileViewerStore - saveActiveFile guard: dirty check", () => {
  it("save is no-op when tab is not dirty", async () => {
    const tab = { id: "ctx1:clean.ts", filePath: "clean.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:clean.ts" });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("fileViewerStore - saveActiveFile guard conditions", () => {
  it("save is no-op when tab is already saving", async () => {
    const tab = { id: "ctx1:saving.ts", filePath: "saving.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: "y", language: "typescript", loading: false, saving: true, error: null, pinned: true, dirty: true };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:saving.ts" });
    await useFileViewerStore.getState().saveActiveFile();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("fileViewerStore - splitEditor without tabId", () => {
  it("splitEditor with no tabId sets rightActiveTabId to null and activeTabId to leftTab", () => {
    const tab = { id: "ctx1:only.ts", filePath: "only.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:only.ts", splitActive: false });
    useFileViewerStore.getState().splitEditor();
    expect(useFileViewerStore.getState().rightActiveTabId).toBeNull();
    expect(useFileViewerStore.getState().activeTabId).toBe("ctx1:only.ts");
    expect(useFileViewerStore.getState().leftActiveTabId).toBe("ctx1:only.ts");
  });
});

describe("fileViewerStore - splitEditor string values", () => {
  it("splitEditor sets focusedPane to 'right'", () => {
    const tab = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:a.ts", splitActive: false });
    useFileViewerStore.getState().splitEditor();
    expect(useFileViewerStore.getState().focusedPane).toBe("right");
  });

  it("closeSplit resets focusedPane to 'left'", () => {
    useFileViewerStore.setState({ splitActive: true, focusedPane: "right", leftActiveTabId: null, rightActiveTabId: null });
    useFileViewerStore.getState().closeSplit();
    expect(useFileViewerStore.getState().focusedPane).toBe("left");
  });

  it("splitEditor with tabId sets rightActiveTabId to that tab", () => {
    const tab = { id: "ctx1:a.ts", filePath: "a.ts", contextId: "ctx1", contextType: "workspace" as const,
      content: "x", editedContent: null, language: "typescript", loading: false, saving: false, error: null, pinned: true, dirty: false };
    useFileViewerStore.setState({ tabs: [tab], activeTabId: "ctx1:a.ts", splitActive: false });
    useFileViewerStore.getState().splitEditor("ctx1:b.ts");
    expect(useFileViewerStore.getState().rightActiveTabId).toBe("ctx1:b.ts");
  });
});

describe("detectLanguage", () => {
  it.each([
    ["app.ts", "typescript"],
    ["app.tsx", "typescript"],
    ["app.js", "javascript"],
    ["app.jsx", "javascript"],
    ["main.rs", "rust"],
    ["main.py", "python"],
    ["data.json", "json"],
    ["README.md", "markdown"],
    ["style.css", "css"],
    ["index.html", "html"],
    ["config.toml", "toml"],
    ["config.yaml", "yaml"],
    ["config.yml", "yaml"],
    ["run.sh", "shell"],
    ["main.go", "go"],
    ["App.java", "java"],
    ["App.swift", "swift"],
    ["main.c", "c"],
    ["main.cpp", "cpp"],
    ["Program.cs", "csharp"],
    ["app.rb", "ruby"],
    ["index.php", "php"],
    ["query.sql", "sql"],
    ["layout.xml", "xml"],
    ["style.scss", "scss"],
    ["file.xyz", "plaintext"],
  ])("returns %s for %s", (file, lang) => {
    expect(detectLanguage(file)).toBe(lang);
  });

  it("handles files with multiple dots", () => {
    expect(detectLanguage("my.component.tsx")).toBe("typescript");
    expect(detectLanguage("data.test.json")).toBe("json");
  });

  it("returns plaintext for no extension", () => {
    expect(detectLanguage("Makefile")).toBe("plaintext");
  });
});
