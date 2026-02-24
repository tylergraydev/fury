import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

const UPDATE_CHECK_DELAY_MS = 5_000;

interface AutoUpdateState {
  update: Update | null;
  checking: boolean;
  installing: boolean;
  installed: boolean;
  error: string | null;
}

export function useAutoUpdate() {
  const [state, setState] = useState<AutoUpdateState>({
    update: null,
    checking: false,
    installing: false,
    installed: false,
    error: null,
  });

  useEffect(() => {
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, checking: true }));
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        setState((s) => ({ ...s, update: update ?? null, checking: false }));
      } catch {
        // Silently fail on startup - user can manually check in Settings
        setState((s) => ({ ...s, checking: false }));
      }
    }, UPDATE_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const install = async () => {
    if (!state.update) return;
    setState((s) => ({ ...s, installing: true, error: null }));
    try {
      await state.update.downloadAndInstall();
      setState((s) => ({ ...s, installing: false, installed: true }));
    } catch (e) {
      setState((s) => ({
        ...s,
        installing: false,
        error: `Install failed: ${e}`,
      }));
    }
  };

  const dismiss = () => {
    setState((s) => ({ ...s, update: null }));
  };

  return { ...state, install, dismiss };
}

export async function getAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}
