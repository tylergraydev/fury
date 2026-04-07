import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export interface UrlContent {
  url: string;
  title: string | null;
  content: string;
  contentType: string;
}

export async function fetchUrlContent(
  url: string,
): Promise<UrlContent> {
  return invoke("fetch_url_content", { url });
}
