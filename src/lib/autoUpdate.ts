import type { Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

export async function checkForAppUpdate(): Promise<Update | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  return update ?? null;
}

export async function getAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}
