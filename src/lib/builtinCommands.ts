import type { SlashCommand } from "./tauri";
import { clearSession } from "./tauri";
import { useChatStore } from "../stores/chatStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

export interface BuiltinCommand extends SlashCommand {
  source: "built-in";
  action?: () => void;
}

export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  {
    name: "clear",
    source: "built-in",
    description: "Clear conversation and start a new session",
    content: "",
    action: () => {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId;
      if (wsId) {
        clearSession(wsId).catch(console.error);
        useChatStore.getState().clearMessages(wsId);
      }
    },
  },
];
