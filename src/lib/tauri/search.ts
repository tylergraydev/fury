import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { CodeSearchResult, IndexProgress, IndexingStatus } from "./bindings.generated";

export type { CodeSearchResult, IndexProgress };

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

export async function getIndexingStatus(repoId: string): Promise<IndexingStatus> {
  return invoke("get_indexing_status", { repoId });
}
