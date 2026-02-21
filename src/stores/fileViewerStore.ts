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

interface FileViewerStore {
  tabs: FileTab[];
  activeTabId: string | null;

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
}

function tabId(contextId: string, filePath: string): string {
  return `${contextId}:${filePath}`;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop() ?? "";
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

    // Load type definitions for TypeScript/JavaScript files (non-blocking)
    if (TS_LANGUAGES.has(result.language)) {
      ensureTypesLoaded(contextId, contextType).catch(() => {});
    }

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

export const useFileViewerStore = create<FileViewerStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: async (contextId, contextType, filePath, pin = false) => {
    const id = tabId(contextId, filePath);
    const state = get();
    const existing = state.tabs.find((t) => t.id === id);

    if (existing) {
      // Already open — activate it, and pin if requested
      set({
        activeTabId: id,
        ...(pin && !existing.pinned
          ? {
              tabs: state.tabs.map((t) =>
                t.id === id ? { ...t, pinned: true } : t,
              ),
            }
          : {}),
      });
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
      set((s) => ({
        tabs: [...s.tabs, newTab],
        activeTabId: id,
      }));
    } else {
      // Preview: replace any existing unpinned preview tab
      const previewIdx = state.tabs.findIndex((t) => !t.pinned);
      if (previewIdx >= 0) {
        const newTabs = [...state.tabs];
        newTabs[previewIdx] = newTab;
        set({ tabs: newTabs, activeTabId: id });
      } else {
        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: id,
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

      if (state.activeTabId === closingId) {
        if (newTabs.length === 0) {
          newActiveId = null;
        } else {
          const nextIdx = Math.min(idx, newTabs.length - 1);
          newActiveId = newTabs[nextIdx].id;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  showChat: () => set({ activeTabId: null }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

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
}));
