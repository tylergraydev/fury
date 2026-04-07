import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { inlineEdit, cancelInlineEdit } from "../lib/tauri";
import type { FrontendStreamEvent } from "../lib/tauri/bindings.generated";

export interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface InlineEditSession {
  editId: string;
  tabId: string;
  filePath: string;
  language: string;
  originalText: string;
  selectionRange: SelectionRange;
  instruction: string;
  status: "prompting" | "generating" | "previewing";
  generatedText: string | null;
  error: string | null;
}

type LastAction = "accepted" | "rejected" | null;

interface InlineEditStore {
  session: InlineEditSession | null;
  lastAction: LastAction;

  startSession: (params: {
    editId: string;
    tabId: string;
    filePath: string;
    language: string;
    originalText: string;
    selectionRange: SelectionRange;
  }) => void;

  submitInstruction: (
    workspaceId: string,
    instruction: string,
    fullFileContent: string,
  ) => Promise<void>;

  acceptEdit: () => void;
  rejectEdit: () => void;
  cancelSession: () => void;
}

export const useInlineEditStore = create<InlineEditStore>((set, get) => ({
  session: null,
  lastAction: null,

  startSession: (params) => {
    // Cancel any existing session
    const existing = get().session;
    if (existing) {
      cancelInlineEdit(existing.editId).catch((e) => {
        console.error("[inlineEdit] failed to cancel prior session:", e);
      });
    }

    set({
      session: {
        ...params,
        instruction: "",
        status: "prompting",
        generatedText: null,
        error: null,
      },
    });
  },

  submitInstruction: async (workspaceId, instruction, fullFileContent) => {
    const session = get().session;
    if (!session) return;

    set({
      session: { ...session, instruction, status: "generating", error: null },
    });

    // Subscribe to stream events for this edit. We must guarantee that the
    // listener is freed on ALL terminal paths (result / error / timeout /
    // sidecar disconnect), otherwise the store leaks listeners on every
    // Cmd+K invocation and gets stuck in "generating" forever.
    let accumulated = "";
    let settled = false;
    let unlisten: (() => void) | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (unlisten) {
        try {
          unlisten();
        } catch (e) {
          console.error("[inlineEdit] failed to unlisten:", e);
        }
        unlisten = null;
      }
    };

    const failSession = (message: string) => {
      cleanup();
      const current = get().session;
      if (current?.editId === session.editId) {
        set({
          session: { ...current, status: "prompting", error: message },
        });
      }
    };

    unlisten = await listen<FrontendStreamEvent>(
      `agent-stream:${session.editId}`,
      (event) => {
        if (settled) return;
        const payload = event.payload;

        if (payload.type === "assistantText") {
          accumulated += payload.text;
        } else if (payload.type === "result") {
          cleanup();
          const current = get().session;
          if (!current || current.editId !== session.editId) return;

          if (payload.isError) {
            set({
              session: {
                ...current,
                status: "prompting",
                error: payload.result || "Edit failed",
              },
            });
          } else {
            // Strip markdown fences if the model wrapped the response
            const cleaned = stripMarkdownFences(accumulated);
            set({
              session: {
                ...current,
                status: "previewing",
                generatedText: cleaned,
              },
            });
          }
        }
      },
    );

    // If the sidecar never sends a terminal event (crash, dropped IPC) we
    // must still recover. 2 minutes is generous for a single inline edit.
    timeoutHandle = setTimeout(() => {
      failSession("Inline edit timed out after 2 minutes");
    }, 120_000);

    try {
      await inlineEdit(
        workspaceId,
        session.editId,
        session.filePath,
        session.language,
        session.originalText,
        fullFileContent,
        instruction,
      );
    } catch (e) {
      failSession(e instanceof Error ? e.message : String(e));
    }
  },

  acceptEdit: () => {
    set({ session: null, lastAction: "accepted" });
  },

  rejectEdit: () => {
    set({ session: null, lastAction: "rejected" });
  },

  cancelSession: () => {
    const session = get().session;
    if (session) {
      if (session.status === "generating") {
        cancelInlineEdit(session.editId).catch((e) => {
          console.error("[inlineEdit] failed to cancel session:", e);
        });
      }
      set({ session: null, lastAction: "rejected" });
    }
  },
}));

/** Strip ```lang\n...\n``` wrapping if the model added it */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```\w*\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}
