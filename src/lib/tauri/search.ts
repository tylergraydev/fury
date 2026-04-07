import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { CodeSearchResult } from "./bindings.generated";

/// Progress payload for `codebase-index-progress:{repoId}` stream events.
/// Mirrors `crate::models::codebase_search::IndexProgress` in Rust. Defined
/// manually because specta only generates types that appear in command
/// signatures, and this one is only used in `emit()` calls.
export interface IndexProgress {
  repoId: string;
  filesIndexed: number;
  totalFiles: number;
  currentFile: string | null;
}

export type { CodeSearchResult };

export async function searchCodebase(
  repoId: string,
  query: string,
  limit?: number,
): Promise<CodeSearchResult[]> {
  return invoke("search_codebase", { repoId, query, limit });
}

export async function searchSymbols(
  repoId: string,
  query: string,
  limit?: number,
): Promise<CodeSearchResult[]> {
  return invoke("search_symbols", { repoId, query, limit });
}

export async function startCodebaseIndexing(repoId: string): Promise<void> {
  return invoke("start_codebase_indexing", { repoId });
}

export async function stopCodebaseIndexing(repoId: string): Promise<void> {
  return invoke("stop_codebase_indexing", { repoId });
}

export async function deleteCodebaseIndex(repoId: string): Promise<void> {
  return invoke("delete_codebase_index", { repoId });
}

export async function getCodebaseIndexStats(
  repoId: string,
): Promise<Record<string, string>> {
  return invoke("get_codebase_index_stats", { repoId });
}

