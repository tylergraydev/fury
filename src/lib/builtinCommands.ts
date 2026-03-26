import type { SlashCommand } from "./tauri";
import { clearSession, stopAgent } from "./tauri";
import { useChatStore } from "../stores/chatStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useUIStore } from "../stores/uiStore";
import { useAgentStore } from "../stores/agentStore";

export interface BuiltinCommand extends SlashCommand {
  source: "built-in";
  action?: () => void;
}

/**
 * Resolve the active context ID using the same fallback chain as App.tsx:
 * activeViewTab.contextId → activeWorkspaceId → activeRepoId
 */
function getActiveContextId(): string | null {
  const { activeWorkspaceId, activeRepoId } = useWorkspaceStore.getState();
  const { viewTabs, activeViewTabId } = useUIStore.getState();
  const activeViewTab = viewTabs.find((t) => t.id === activeViewTabId);
  return activeViewTab?.contextId ?? activeWorkspaceId ?? activeRepoId ?? null;
}

export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  {
    name: "clear",
    source: "built-in",
    description: "Clear conversation and start a new session",
    content: "",
    action: () => {
      const contextId = getActiveContextId();
      if (contextId) {
        // Stop the agent first so stream events don't repopulate messages
        const status = useAgentStore.getState().agents[contextId]?.status;
        if (status === "Running") {
          stopAgent(contextId).catch(console.error);
        }
        clearSession(contextId).catch(console.error);
        useChatStore.getState().clearMessages(contextId);
      }
    },
  },
];
