import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";
import type {
  SidecarCommand,
  QueryCommand,
  PermissionResponseCommand,
  InterruptCommand,
} from "./protocol.js";

// Track active queries and pending permissions per workspace
const activeQueries = new Map<string, { abort: () => void }>();
const pendingPermissions = new Map<
  string,
  (approved: boolean) => void
>();

function emit(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

async function handleQuery(cmd: QueryCommand): Promise<void> {
  const {
    id,
    prompt,
    cwd,
    sessionId,
    model,
    systemPrompt,
    permissionMode,
    allowedTools,
    disallowedTools,
    envVars,
    additionalDirs,
    disableThinking,
  } = cmd;

  // Build env: inherit current process.env and overlay workspace-specific vars
  const env: Record<string, string | undefined> = { ...process.env };
  if (envVars) {
    for (const [key, value] of Object.entries(envVars)) {
      env[key] = value;
    }
  }

  try {
    const options: Record<string, unknown> = {
      cwd,
      env,
      permissionMode: permissionMode || "default",
      includePartialMessages: true,
      canUseTool: async (
        toolName: string,
        input: Record<string, unknown>,
        callOptions: { signal: AbortSignal; title?: string; description?: string; toolUseID: string },
      ) => {
        // Emit permission request to Rust
        emit({
          id,
          type: "input_request",
          tool_name: toolName,
          tool_use_id: callOptions.toolUseID,
          title: callOptions.title,
          description: callOptions.description,
          input,
        });
        // Block until Rust sends permission_response
        const approved = await new Promise<boolean>((resolve) => {
          pendingPermissions.set(id, resolve);
        });
        if (approved) {
          return { behavior: "allow" as const };
        }
        return { behavior: "deny" as const, message: "User denied permission" };
      },
    };

    if (model) options.model = model;
    if (sessionId) options.resume = sessionId;
    if (systemPrompt) {
      options.systemPrompt = {
        type: "preset",
        preset: "claude_code",
        append: systemPrompt,
      };
    }
    if (allowedTools) options.allowedTools = allowedTools;
    if (disallowedTools) options.disallowedTools = disallowedTools;
    if (additionalDirs) options.additionalDirectories = additionalDirs;
    if (disableThinking) options.thinking = { type: "disabled" };

    const q = sdkQuery({
      prompt,
      options,
    });

    activeQueries.set(id, { abort: () => q.interrupt() });

    for await (const message of q) {
      // Forward SDK messages as NDJSON, adding the workspace id
      const event = { id, ...(message as Record<string, unknown>) };
      emit(event);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    emit({ id, type: "error", message: errorMessage });
  } finally {
    activeQueries.delete(id);
    pendingPermissions.delete(id);
  }
}

function handlePermissionResponse(cmd: PermissionResponseCommand): void {
  const resolver = pendingPermissions.get(cmd.id);
  if (resolver) {
    resolver(cmd.approved);
    pendingPermissions.delete(cmd.id);
  }
}

async function handleInterrupt(cmd: InterruptCommand): Promise<void> {
  const active = activeQueries.get(cmd.id);
  if (active) {
    active.abort();
  }
}

// Main: read stdin line by line
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (line: string) => {
  try {
    const cmd = JSON.parse(line) as SidecarCommand;
    switch (cmd.type) {
      case "query":
        // Don't await — run concurrently for multiple workspaces
        handleQuery(cmd).catch((e: unknown) => {
          emit({ id: cmd.id, type: "error", message: String(e) });
        });
        break;
      case "permission_response":
        handlePermissionResponse(cmd);
        break;
      case "interrupt":
        await handleInterrupt(cmd);
        break;
      case "shutdown":
        process.exit(0);
        break;
    }
  } catch {
    // Invalid JSON — ignore
  }
});

rl.on("close", () => {
  process.exit(0);
});

// Keep process alive
process.stdin.resume();
