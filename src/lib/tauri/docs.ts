import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export interface DocLibrary {
  id: string;
  name: string;
  version: string | null;
}

export async function resolveLibraryId(
  libraryName: string,
): Promise<DocLibrary[]> {
  return invoke("resolve_library_id", { libraryName });
}

export async function queryLibraryDocs(
  libraryId: string,
  query: string,
): Promise<string> {
  return invoke("query_library_docs", { libraryId, query });
}
