import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { SendMessageRequest, AgentInfo } from "./types";

// Agent commands
export async function sendMessage(request: SendMessageRequest): Promise<void> {
  return invoke("send_message", { request });
}

export async function sendFollowupMessage(
  workspaceId: string,
  message: string,
): Promise<void> {
  return invoke("send_followup_message", { workspaceId, message });
}

export async function stopAgent(workspaceId: string): Promise<void> {
  return invoke("stop_agent", { workspaceId });
}

export async function getAgentStatus(workspaceId: string): Promise<AgentInfo> {
  return invoke<AgentInfo>("get_agent_status", { workspaceId });
}

export async function clearSession(workspaceId: string): Promise<void> {
  return invoke("clear_session", { workspaceId });
}

export async function respondToPermission(
  workspaceId: string,
  approved: boolean,
): Promise<void> {
  return invoke("respond_to_permission", { workspaceId, approved });
}
