import { invoke } from "@tauri-apps/api/core";
import * as monaco from "monaco-editor";

// --- Tauri IPC types ---

interface DocSyncEvent {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

interface DocChangeEvent {
  uri: string;
  version: number;
  text: string;
}

export interface CopilotCompletionItem {
  insertText: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  command?: unknown;
}

export interface CompletionResult {
  items: CopilotCompletionItem[];
}

export interface CopilotSignInResult {
  status: string;
  userCode: string | null;
  verificationUri: string | null;
  user: string | null;
}

// --- Tauri IPC wrappers ---

export async function startCopilot(rootUri: string): Promise<void> {
  return invoke("start_copilot", { rootUri });
}

export async function stopCopilot(): Promise<void> {
  return invoke("stop_copilot");
}

export async function copilotSignIn(): Promise<CopilotSignInResult> {
  return invoke<CopilotSignInResult>("copilot_sign_in");
}

export async function copilotCheckStatus(): Promise<unknown> {
  return invoke("copilot_check_status");
}

async function copilotDidOpen(event: DocSyncEvent): Promise<void> {
  return invoke("copilot_did_open", { event });
}

async function copilotDidChange(event: DocChangeEvent): Promise<void> {
  return invoke("copilot_did_change", { event });
}

async function copilotDidClose(uri: string): Promise<void> {
  return invoke("copilot_did_close", { uri });
}

async function copilotComplete(
  uri: string,
  line: number,
  character: number,
): Promise<CompletionResult> {
  return invoke<CompletionResult>("copilot_complete", { uri, line, character });
}

// --- Document tracking ---

const openDocuments = new Map<
  string,
  { version: number; languageId: string }
>();

let providerDisposable: monaco.IDisposable | null = null;

function toFileUri(filePath: string): string {
  if (filePath.startsWith("file://")) return filePath;
  return `file://${filePath}`;
}

// --- Document sync ---

export async function notifyDocumentOpened(
  filePath: string,
  languageId: string,
  content: string,
): Promise<void> {
  const uri = toFileUri(filePath);
  if (openDocuments.has(uri)) return;

  const version = 1;
  openDocuments.set(uri, { version, languageId });

  try {
    await copilotDidOpen({ uri, languageId, version, text: content });
  } catch {
    // Copilot may not be running yet
    openDocuments.delete(uri);
  }
}

let changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function notifyDocumentChanged(
  filePath: string,
  content: string,
): void {
  if (changeDebounceTimer) clearTimeout(changeDebounceTimer);

  changeDebounceTimer = setTimeout(async () => {
    const uri = toFileUri(filePath);
    const doc = openDocuments.get(uri);
    if (!doc) return;

    doc.version += 1;
    try {
      await copilotDidChange({ uri, version: doc.version, text: content });
    } catch {
      // Best-effort
    }
  }, 50);
}

export async function notifyDocumentClosed(filePath: string): Promise<void> {
  const uri = toFileUri(filePath);
  if (!openDocuments.has(uri)) return;

  openDocuments.delete(uri);
  try {
    await copilotDidClose(uri);
  } catch {
    // Best-effort
  }
}

// --- Monaco InlineCompletionsProvider ---

export function registerCopilotProvider(): void {
  if (providerDisposable) return;

  providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    { pattern: "**" },
    {
      provideInlineCompletions: async (model, position, _context, token) => {
        const uri = toFileUri(model.uri.path);
        const doc = openDocuments.get(uri);
        if (!doc) return { items: [] };

        try {
          const result = await copilotComplete(
            uri,
            position.lineNumber - 1, // Monaco 1-indexed → LSP 0-indexed
            position.column - 1,
          );

          if (token.isCancellationRequested) return { items: [] };

          return {
            items: result.items.map((item) => ({
              insertText: item.insertText,
              range: item.range
                ? new monaco.Range(
                    item.range.start.line + 1,
                    item.range.start.character + 1,
                    item.range.end.line + 1,
                    item.range.end.character + 1,
                  )
                : undefined,
            })),
          };
        } catch {
          return { items: [] };
        }
      },

      disposeInlineCompletions: (_completions, _reason) => {
        // Nothing to clean up
      },
    },
  );
}

export function disposeCopilotProvider(): void {
  if (providerDisposable) {
    providerDisposable.dispose();
    providerDisposable = null;
  }
  openDocuments.clear();
}
