import { create } from "zustand";
import {
  readWorkspaceFile,
  readRepoFile,
  writeWorkspaceFile,
  writeRepoFile,
} from "../lib/tauri";
import { ensureTypesLoaded } from "../lib/monacoSetup";
import { notifyDocumentClosed } from "../lib/copilot";

export interface FileTab {
  id: string;
  filePath: string;
  contextId: string;
  contextType: "workspace" | "repo";
  content: string | null;
  editedContent: string | null;
  language: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  pinned: boolean;
  dirty: boolean;
}

export type PaneId = "left" | "right";

interface FileViewerStore {
  tabs: FileTab[];
  activeTabId: string | null;
  revealLine: { tabId: string; line: number } | null;

  // Split editor state
  splitActive: boolean;
  focusedPane: PaneId;
  leftActiveTabId: string | null;
  rightActiveTabId: string | null;

  openFile: (
    contextId: string,
    contextType: "workspace" | "repo",
    filePath: string,
    pin?: boolean,
  ) => Promise<void>;
  pinTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  showChat: () => void;
  closeAllTabs: () => void;
  updateContent: (tabId: string, newContent: string) => void;
  saveActiveFile: (formatOnSave?: boolean) => Promise<void>;
  setRevealLine: (tabId: string, line: number) => void;
  clearRevealLine: () => void;

  // Split editor actions
  splitEditor: (tabId?: string) => void;
  closeSplit: () => void;
  setFocusedPane: (pane: PaneId) => void;
  setActiveTabInPane: (pane: PaneId, tabId: string) => void;
}

function tabId(contextId: string, filePath: string): string {
  return `${contextId}:${filePath}`;
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()!;
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    go: "go",
    java: "java",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sql: "sql",
    xml: "xml",
    scss: "scss",
  };
  return map[ext] ?? "plaintext";
}

const TS_LANGUAGES = new Set([
  "typescript",
  "javascript",
]);

async function fetchContent(
  id: string,
  contextId: string,
  contextType: "workspace" | "repo",
  filePath: string,
) {
  try {
    const result =
      contextType === "workspace"
        ? await readWorkspaceFile(contextId, filePath)
        : await readRepoFile(contextId, filePath);

    /* v8 ignore start -- v8 miscounts implicit else branch */
    // Load type definitions for TypeScript/JavaScript files (non-blocking)
    if (TS_LANGUAGES.has(result.language)) {
      ensureTypesLoaded(contextId, contextType).catch(() => {});
    }
    /* v8 ignore stop */

    useFileViewerStore.setState((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              content: result.content,
              editedContent: null,
              language: result.language,
              loading: false,
              dirty: false,
            }
          : t,
      ),
    }));
  } catch (e) {
    useFileViewerStore.setState((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, loading: false, error: String(e) } : t,
      ),
    }));
  }
}

/** Pick the next available tab for a pane after a tab is removed, excluding a specific tab. */
function pickNextTab(tabs: FileTab[], excludeId: string | null): string | null {
  const available = tabs.find((t) => t.id !== excludeId);
  return available?.id ?? null;
}

export const useFileViewerStore = create<FileViewerStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  revealLine: null,

  // Split state defaults
  splitActive: false,
  focusedPane: "left",
  leftActiveTabId: null,
  rightActiveTabId: null,

  openFile: async (contextId, contextType, filePath, pin = false) => {
    const id = tabId(contextId, filePath);
    const state = get();
    const existing = state.tabs.find((t) => t.id === id);

    if (existing) {
      // Already open — activate it in the focused pane (or single pane), and pin if requested
      const updates: Partial<FileViewerStore> = {
        activeTabId: id,
        ...(pin && !existing.pinned
          ? {
              tabs: state.tabs.map((t) =>
                t.id === id ? { ...t, pinned: true } : t,
              ),
            }
          : {}),
      };

      if (state.splitActive) {
        if (state.focusedPane === "left") {
          updates.leftActiveTabId = id;
        } else {
          updates.rightActiveTabId = id;
        }
      }

      set(updates);
      return;
    }

    const newTab: FileTab = {
      id,
      filePath,
      contextId,
      contextType,
      content: null,
      editedContent: null,
      language: detectLanguage(filePath),
      loading: true,
      saving: false,
      error: null,
      pinned: pin,
      dirty: false,
    };

    if (pin) {
      // Pinned: always add a new tab
      const paneUpdate: Partial<FileViewerStore> = {};
      if (state.splitActive) {
        if (state.focusedPane === "left") {
          paneUpdate.leftActiveTabId = id;
        } else {
          paneUpdate.rightActiveTabId = id;
        }
      }
      set((s) => ({
        tabs: [...s.tabs, newTab],
        activeTabId: id,
        ...paneUpdate,
      }));
    } else {
      // Preview: replace any existing unpinned preview tab
      const previewIdx = state.tabs.findIndex((t) => !t.pinned);
      const paneUpdate: Partial<FileViewerStore> = {};
      if (state.splitActive) {
        if (state.focusedPane === "left") {
          paneUpdate.leftActiveTabId = id;
        } else {
          paneUpdate.rightActiveTabId = id;
        }
      }
      if (previewIdx >= 0) {
        const newTabs = [...state.tabs];
        newTabs[previewIdx] = newTab;
        set({ tabs: newTabs, activeTabId: id, ...paneUpdate });
      } else {
        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: id,
          ...paneUpdate,
        }));
      }
    }

    fetchContent(id, contextId, contextType, filePath);
  },

  pinTab: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, pinned: true } : t,
      ),
    }));
  },

  closeTab: (closingId) => {
    const closingTab = get().tabs.find((t) => t.id === closingId);
    if (closingTab) {
      notifyDocumentClosed(closingTab.filePath);
    }

    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === closingId);
      const newTabs = state.tabs.filter((t) => t.id !== closingId);
      let newActiveId = state.activeTabId;

      // Handle split mode pane updates
      let newLeftId = state.leftActiveTabId;
      let newRightId = state.rightActiveTabId;
      let newSplitActive = state.splitActive;

      if (state.splitActive) {
        if (state.leftActiveTabId === closingId) {
          newLeftId = pickNextTab(newTabs, state.rightActiveTabId);
        }
        if (state.rightActiveTabId === closingId) {
          newRightId = pickNextTab(newTabs, state.leftActiveTabId);
        }
        // Close split if the right pane has no tab
        if (newRightId === null) {
          newSplitActive = false;
          newActiveId = newLeftId;
          newLeftId = null;
          newRightId = null;
        } else {
          // Update activeTabId to match focused pane
          newActiveId = state.focusedPane === "left" ? newLeftId : newRightId;
        }
      } else {
        if (state.activeTabId === closingId) {
          if (newTabs.length === 0) {
            newActiveId = null;
          } else {
            const nextIdx = Math.min(idx, newTabs.length - 1);
            newActiveId = newTabs[nextIdx].id;
          }
        }
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId,
        splitActive: newSplitActive,
        leftActiveTabId: newLeftId,
        rightActiveTabId: newRightId,
      };
    });
  },

  setActiveTab: (tabId) => {
    const state = get();
    if (state.splitActive) {
      const updates: Partial<FileViewerStore> = { activeTabId: tabId };
      if (state.focusedPane === "left") {
        updates.leftActiveTabId = tabId;
      } else {
        updates.rightActiveTabId = tabId;
      }
      set(updates);
    } else {
      set({ activeTabId: tabId });
    }
  },

  showChat: () => {
    const state = get();
    if (state.splitActive) {
      if (state.focusedPane === "left") {
        const newLeftId = null;
        // If both panes would be null, close split
        if (state.rightActiveTabId === null) {
          set({ activeTabId: null, splitActive: false, leftActiveTabId: null, rightActiveTabId: null });
        } else {
          set({ activeTabId: null, leftActiveTabId: newLeftId });
        }
      } else {
        // Close the right pane → exit split, keep left
        set({
          splitActive: false,
          activeTabId: state.leftActiveTabId,
          leftActiveTabId: null,
          rightActiveTabId: null,
          focusedPane: "left",
        });
      }
    } else {
      set({ activeTabId: null });
    }
  },

  closeAllTabs: () => set({
    tabs: [],
    activeTabId: null,
    splitActive: false,
    leftActiveTabId: null,
    rightActiveTabId: null,
    focusedPane: "left",
  }),

  updateContent: (tabId, newContent) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              editedContent: newContent,
              dirty: newContent !== t.content,
              pinned: true,
            }
          : t,
      ),
    }));
  },

  saveActiveFile: async (formatOnSave = true) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab || !tab.dirty || tab.saving) return;

    const contentToSave = tab.editedContent ?? tab.content;
    if (contentToSave === null) return;

    // Mark as saving
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, saving: true } : t,
      ),
    }));

    try {
      const result =
        tab.contextType === "workspace"
          ? await writeWorkspaceFile(
              tab.contextId,
              tab.filePath,
              contentToSave,
              formatOnSave,
            )
          : await writeRepoFile(
              tab.contextId,
              tab.filePath,
              contentToSave,
              formatOnSave,
            );

      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                content: result.content,
                editedContent: result.content,
                dirty: false,
                saving: false,
                error: null,
              }
            : t,
        ),
      }));
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, saving: false, error: `Save failed: ${String(e)}` }
            : t,
        ),
      }));
    }
  },

  setRevealLine: (tabId, line) => set({ revealLine: { tabId, line } }),
  clearRevealLine: () => set({ revealLine: null }),

  // --- Split editor actions ---

  splitEditor: (tabId?: string) => {
    const state = get();
    if (state.splitActive) return;

    const leftTab = state.activeTabId;
    const rightTab = tabId ?? null;

    set({
      splitActive: true,
      leftActiveTabId: leftTab,
      rightActiveTabId: rightTab,
      focusedPane: rightTab ? "right" : "right",
      activeTabId: rightTab ?? leftTab,
    });
  },

  closeSplit: () => {
    const state = get();
    const keepTabId =
      state.focusedPane === "left"
        ? state.leftActiveTabId
        : state.rightActiveTabId;

    set({
      splitActive: false,
      activeTabId: keepTabId ?? state.leftActiveTabId,
      leftActiveTabId: null,
      rightActiveTabId: null,
      focusedPane: "left",
    });
  },

  setFocusedPane: (pane) => {
    const state = get();
    const tabId = pane === "left" ? state.leftActiveTabId : state.rightActiveTabId;
    set({ focusedPane: pane, activeTabId: tabId });
  },

  setActiveTabInPane: (pane, tabId) => {
    const state = get();
    const updates: Partial<FileViewerStore> = {};
    if (pane === "left") {
      updates.leftActiveTabId = tabId;
    } else {
      updates.rightActiveTabId = tabId;
    }
    if (state.focusedPane === pane) {
      updates.activeTabId = tabId;
    }
    set(updates);
  },
}));
