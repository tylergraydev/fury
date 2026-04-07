import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(
  query: string,
  limit?: number,
): Promise<WebSearchResult[]> {
  return invoke("web_search", { query, limit });
}
