import { instrumentedInvoke } from "./ipcInstrumentation";
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
  return instrumentedInvoke("start_copilot", { rootUri });
}

export async function stopCopilot(): Promise<void> {
  return instrumentedInvoke("stop_copilot");
}

export async function copilotSignIn(): Promise<CopilotSignInResult> {
  return instrumentedInvoke<CopilotSignInResult>("copilot_sign_in");
}

export async function copilotCheckStatus(): Promise<unknown> {
  return instrumentedInvoke("copilot_check_status");
}

async function copilotDidOpen(event: DocSyncEvent): Promise<void> {
  return instrumentedInvoke("copilot_did_open", { event });
}

async function copilotDidChange(event: DocChangeEvent): Promise<void> {
  return instrumentedInvoke("copilot_did_change", { event });
}

async function copilotDidClose(uri: string): Promise<void> {
  return instrumentedInvoke("copilot_did_close", { uri });
}

async function copilotComplete(
  uri: string,
  line: number,
  character: number,
  triggerKind: number,
): Promise<CompletionResult> {
  return instrumentedInvoke<CompletionResult>("copilot_complete", { uri, line, character, triggerKind });
}

async function copilotNotifyAccepted(uuid: string): Promise<void> {
  return instrumentedInvoke("copilot_notify_accepted", { uuid });
}

async function copilotNotifyRejected(uuids: string[]): Promise<void> {
  return instrumentedInvoke("copilot_notify_rejected", { uuids });
}

// --- Document tracking ---

const openDocuments = new Map<
  string,
  { version: number; languageId: string }
>();

let providerDisposable: monaco.IDisposable | null = null;
let acceptCommandDisposable: monaco.IDisposable | null = null;

export function toFileUri(filePath: string): string {
  if (filePath.startsWith("file://")) return filePath;
  // Handle Windows drive letter paths (e.g. C:\Users\... -> file:///C:/Users/...)
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
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
  } catch (e) {
    console.warn("[copilot] Failed to notify document opened (Copilot may not be running):", e);
    openDocuments.delete(uri);
  }
}

const changeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    changeDebounceTimers.forEach((id) => clearTimeout(id));
    changeDebounceTimers.clear();
    openDocuments.clear();
    if (providerDisposable) { providerDisposable.dispose(); providerDisposable = null; }
    if (acceptCommandDisposable) { acceptCommandDisposable.dispose(); acceptCommandDisposable = null; }
  });
}

export function notifyDocumentChanged(
  filePath: string,
  content: string,
): void {
  const uri = toFileUri(filePath);
  const existing = changeDebounceTimers.get(uri);
  if (existing) clearTimeout(existing);

  changeDebounceTimers.set(
    uri,
    setTimeout(async () => {
      changeDebounceTimers.delete(uri);
      const doc = openDocuments.get(uri);
      if (!doc) return;

      doc.version += 1;
      // Invalidate completion cache for this document
      invalidateCompletionCache(uri);
      try {
        await copilotDidChange({ uri, version: doc.version, text: content });
      } catch (e) {
        console.warn("[copilot] Failed to notify document change:", e);
      }
    }, 50),
  );
}

export async function notifyDocumentClosed(filePath: string): Promise<void> {
  const uri = toFileUri(filePath);
  if (!openDocuments.has(uri)) return;

  openDocuments.delete(uri);
  invalidateCompletionCache(uri);
  try {
    await copilotDidClose(uri);
  } catch (e) {
    console.warn("[copilot] Failed to notify document closed:", e);
  }
}

// --- Completion cache ---

const CACHE_TTL_MS = 5000;

interface CachedCompletion {
  result: CompletionResult;
  timestamp: number;
}

const completionCache = new Map<string, CachedCompletion>();

function cacheKey(uri: string, line: number, character: number, docVersion: number): string {
  return `${uri}:${line}:${character}:${docVersion}`;
}

function getCachedCompletion(key: string): CompletionResult | null {
  const entry = completionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    completionCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedCompletion(key: string, result: CompletionResult): void {
  completionCache.set(key, { result, timestamp: Date.now() });
}

function invalidateCompletionCache(uri: string): void {
  for (const key of completionCache.keys()) {
    if (key.startsWith(uri)) {
      completionCache.delete(key);
    }
  }
}

// --- Speculative completion (edit prediction) ---

/**
 * Fire a speculative completion request and cache the result.
 * Called after a substantial edit (e.g., accepting a completion) to pre-populate
 * the cache for the next likely cursor position. Failures are silently ignored.
 */
export function speculativeComplete(uri: string, line: number, character: number): void {
  const doc = openDocuments.get(uri);
  if (!doc) return;

  const key = cacheKey(uri, line, character, doc.version);
  // Don't speculate if we already have a cached result
  if (getCachedCompletion(key)) return;

  copilotComplete(uri, line, character, 1).then(
    (result) => {
      // Re-check doc version — it may have changed during the request
      const currentDoc = openDocuments.get(uri);
      if (currentDoc && currentDoc.version === doc.version) {
        setCachedCompletion(key, result);
      }
    },
    () => {
      // Silently ignore speculative failures
    },
  );
}

// --- Debounced completion requests ---

const COMPLETION_DEBOUNCE_MS = 75;

let pendingCompletionReject: (() => void) | null = null;
let completionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedCopilotComplete(
  uri: string,
  line: number,
  character: number,
  triggerKind: number,
  token: monaco.CancellationToken,
): Promise<CompletionResult> {
  // Cancel any pending debounced request
  if (pendingCompletionReject) {
    pendingCompletionReject();
    pendingCompletionReject = null;
  }
  if (completionDebounceTimer) {
    clearTimeout(completionDebounceTimer);
    completionDebounceTimer = null;
  }

  return new Promise<CompletionResult>((resolve, reject) => {
    // Allow cancellation from Monaco's token
    const cancelListener = token.onCancellationRequested(() => {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
      cancelListener.dispose();
      reject(new Error("cancelled"));
    });

    pendingCompletionReject = () => {
      cancelListener.dispose();
      reject(new Error("superseded"));
    };

    completionDebounceTimer = setTimeout(async () => {
      completionDebounceTimer = null;
      pendingCompletionReject = null;
      cancelListener.dispose();

      if (token.isCancellationRequested) {
        reject(new Error("cancelled"));
        return;
      }

      try {
        const result = await copilotComplete(uri, line, character, triggerKind);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }, COMPLETION_DEBOUNCE_MS);
  });
}

// --- Acceptance tracking ---

const ACCEPT_COMMAND_ID = "copilot.completionAccepted";

function extractCompletionUuid(command: unknown): string | null {
  if (!command || typeof command !== "object") return null;
  const cmd = command as Record<string, unknown>;
  // Copilot LSP typically includes a UUID in the command arguments
  if (Array.isArray(cmd.arguments) && typeof cmd.arguments[0] === "string") {
    return cmd.arguments[0];
  }
  if (typeof cmd.uuid === "string") return cmd.uuid;
  return null;
}

// --- Monaco InlineCompletionsProvider ---

export function registerCopilotProvider(): void {
  if (providerDisposable) return;

  // Register a Monaco command that fires when a completion is accepted
  if (!acceptCommandDisposable) {
    acceptCommandDisposable = monaco.editor.registerCommand(
      ACCEPT_COMMAND_ID,
      (_accessor, uuid: string) => {
        copilotNotifyAccepted(uuid).catch((e) => {
          console.warn("[copilot] Failed to notify acceptance:", e);
        });
      },
    );
  }

  providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    { pattern: "**" },
    {
      provideInlineCompletions: async (model, position, _context, token) => {
        const uri = toFileUri(model.uri.path);
        const doc = openDocuments.get(uri);
        if (!doc) return { items: [] };

        if (token.isCancellationRequested) return { items: [] };

        const line = position.lineNumber - 1; // Monaco 1-indexed → LSP 0-indexed
        const character = position.column - 1;

        // Check cache first
        const key = cacheKey(uri, line, character, doc.version);
        const cached = getCachedCompletion(key);
        if (cached) {
          return { items: mapCompletionItems(cached) };
        }

        try {
          const result = await debouncedCopilotComplete(uri, line, character, 1, token);

          if (token.isCancellationRequested) return { items: [] };

          // Cache the result
          setCachedCompletion(key, result);

          return { items: mapCompletionItems(result) };
        } catch (e) {
          // Silently ignore debounce cancellations (superseded/cancelled)
          if (e instanceof Error && (e.message === "superseded" || e.message === "cancelled")) {
            return { items: [] };
          }
          console.warn("[copilot] Inline completion request failed:", e);
          return { items: [] };
        }
      },

      disposeInlineCompletions: (_completions, _reason) => {
        // Nothing to clean up
      },
    },
  );
}

function mapCompletionItems(result: CompletionResult): monaco.languages.InlineCompletion[] {
  return result.items.map((item) => {
    const uuid = extractCompletionUuid(item.command);
    const mapped: monaco.languages.InlineCompletion = {
      insertText: item.insertText,
      range: item.range
        ? new monaco.Range(
            item.range.start.line + 1,
            item.range.start.character + 1,
            item.range.end.line + 1,
            item.range.end.character + 1,
          )
        : undefined,
    };
    // Attach acceptance command if we have a UUID
    if (uuid) {
      mapped.command = {
        id: ACCEPT_COMMAND_ID,
        title: "Copilot Completion Accepted",
        arguments: [uuid],
      };
    }
    return mapped;
  });
}

export function disposeCopilotProvider(): void {
  if (providerDisposable) {
    providerDisposable.dispose();
    providerDisposable = null;
  }
  if (acceptCommandDisposable) {
    acceptCommandDisposable.dispose();
    acceptCommandDisposable = null;
  }
  if (completionDebounceTimer) {
    clearTimeout(completionDebounceTimer);
    completionDebounceTimer = null;
  }
  pendingCompletionReject = null;
  for (const timer of changeDebounceTimers.values()) {
    clearTimeout(timer);
  }
  changeDebounceTimers.clear();
  completionCache.clear();
  openDocuments.clear();
}
