import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useToastStore } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import { detectLspSuggestions } from "./tauri";

const checkedRepoPaths = new Set<string>();

/** @internal Reset state between tests. */
export function _resetCheckedPaths(): void {
  checkedRepoPaths.clear();
}

export function initLspSuggestionListener(): () => void {
  let prevActiveWorkspaceId: string | null = null;

  const unsub = useWorkspaceStore.subscribe((state) => {
    const wsId = state.activeWorkspaceId;
    if (!wsId || wsId === prevActiveWorkspaceId) return;
    prevActiveWorkspaceId = wsId;

    const ws = state.workspaces.find((w) => w.id === wsId);
    if (!ws) return;

    const repo = useRepositoryStore
      .getState()
      .repositories.find((r) => r.id === ws.repoId);
    if (!repo) return;

    if (checkedRepoPaths.has(repo.path)) return;
    checkedRepoPaths.add(repo.path);

    detectLspSuggestions(repo.path)
      .then((suggestions) => {
        if (suggestions.length === 0) return;

        const languages = suggestions.map((s) => s.language).join(", ");
        const count = suggestions.length;

        useToastStore.getState().addToast(
          `${count} LSP plugin${count > 1 ? "s" : ""} available for this project (${languages})`,
          "info",
          {
            action: {
              label: "View",
              onClick: () => {
                useUIStore.getState().setSettingsInitialTab("code-intel");
                useUIStore.getState().openViewTab("settings");
              },
            },
          },
        );
      })
      .catch(() => {
        // Silently ignore detection failures
      });
  });

  return unsub;
}
