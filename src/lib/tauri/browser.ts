import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export async function createBrowser(
  url: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string> {
  return invoke<string>("create_browser", { url, x, y, width, height });
}

export async function navigateBrowser(
  browserId: string,
  url: string,
): Promise<void> {
  return invoke("navigate_browser", { browserId, url });
}

export async function updateBrowserBounds(
  browserId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  return invoke("update_browser_bounds", { browserId, x, y, width, height });
}

export async function showBrowser(browserId: string): Promise<void> {
  return invoke("show_browser", { browserId });
}

export async function hideBrowser(browserId: string): Promise<void> {
  return invoke("hide_browser", { browserId });
}

export async function closeBrowser(browserId: string): Promise<void> {
  return invoke("close_browser", { browserId });
}

export async function evalBrowserJs(
  browserId: string,
  script: string,
): Promise<void> {
  return invoke("eval_browser_js", { browserId, script });
}
