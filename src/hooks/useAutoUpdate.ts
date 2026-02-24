import { useEffect } from "react";
import { checkForUpdate } from "../lib/tauri";
import { useToastStore } from "../stores/toastStore";

export function useAutoUpdate() {
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update = await checkForUpdate();
        if (update) {
          useToastStore.getState().addToast(
            `Update available: v${update.version}`,
            "info",
            {
              persistent: true,
              action: {
                label: "Install & Restart",
                onClick: async () => {
                  try {
                    await update.downloadAndInstall();
                    const { relaunch } = await import("@tauri-apps/plugin-process");
                    await relaunch();
                  } catch (e) {
                    useToastStore.getState().addToast(
                      `Update failed: ${e}`,
                      "error",
                    );
                  }
                },
              },
            },
          );
        }
      } catch {
        // Silently ignore — user can manually check in Settings > Updates
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);
}
