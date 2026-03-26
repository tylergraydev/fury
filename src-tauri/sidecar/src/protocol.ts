// Inbound commands (Rust -> sidecar via stdin)
export type SidecarCommand =
  | {
      type: "query";
      id: string; // workspace UUID
      prompt: string;
      cwd: string;
      sessionId?: string;
      model?: string;
      systemPrompt?: string;
      permissionMode: "default" | "acceptEdits" | "bypassPermissions";
      allowedTools?: string[];
      disallowedTools?: string[];
      envVars?: Record<string, string>;
      additionalDirs?: string[];
      disableThinking?: boolean;
    }
  | { type: "permission_response"; id: string; approved: boolean }
  | { type: "interrupt"; id: string }
  | { type: "shutdown" };

// Extract the query command type for convenience
export type QueryCommand = Extract<SidecarCommand, { type: "query" }>;
export type PermissionResponseCommand = Extract<SidecarCommand, { type: "permission_response" }>;
export type InterruptCommand = Extract<SidecarCommand, { type: "interrupt" }>;

// Outbound events (sidecar -> Rust via stdout NDJSON)
// These match the CLI's stream-json format with an added `id` field
export interface SidecarEvent {
  id: string;
  [key: string]: unknown;
}
