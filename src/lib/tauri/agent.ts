import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { SendMessageRequest, AgentInfo, FrontendStreamEvent } from "./types";

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
  updatedPermissions?: unknown[],
  decisionClassification?: string,
): Promise<void> {
  return invoke("respond_to_permission", {
    workspaceId,
    approved,
    updatedPermissions: updatedPermissions ?? null,
    decisionClassification: decisionClassification ?? null,
  });
}

export async function getPendingPermission(
  workspaceId: string,
): Promise<FrontendStreamEvent | null> {
  return invoke<FrontendStreamEvent | null>("get_pending_permission", { workspaceId });
}

// Claude permission management
export interface ClaudePermissions {
  allow: string[];
  deny: string[];
}

export interface ClaudePermissionsResponse {
  permissions: ClaudePermissions;
  settingsPath: string;
}

export async function getClaudePermissions(): Promise<ClaudePermissionsResponse> {
  return invoke<ClaudePermissionsResponse>("get_claude_permissions");
}

export async function addClaudePermissions(rules: string[]): Promise<ClaudePermissions> {
  return invoke<ClaudePermissions>("add_claude_permissions", { rules });
}

export async function removeClaudePermissions(rules: string[]): Promise<ClaudePermissions> {
  return invoke<ClaudePermissions>("remove_claude_permissions", { rules });
}
