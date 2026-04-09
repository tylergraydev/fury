import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";
import type {
  SidecarCommand,
  QueryCommand,
  PermissionResponseCommand,
  InterruptCommand,
} from "./protocol.js";
import { MemoryStore, extractObservation, createMemoryMcpServer } from "./memory/index.js";

// Track active queries and pending permissions per workspace
const activeQueries = new Map<string, { abort: () => void }>();
const pendingPermissions = new Map<
  string,
  (response: { approved: boolean; updatedPermissions?: unknown[]; decisionClassification?: string; updatedInput?: Record<string, unknown> }) => void
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
    repoId,
    memoryEnabled,
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
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      canUseTool: async (
        toolName: string,
        input: Record<string, unknown>,
        callOptions: {
          signal: AbortSignal;
          title?: string;
          description?: string;
          toolUseID: string;
          suggestions?: unknown[];
        },
      ) => {
        // Emit permission request to Rust, including SDK suggestions for
        // "allow for session" / "always allow" flows
        emit({
          id,
          type: "input_request",
          tool_name: toolName,
          tool_use_id: callOptions.toolUseID,
          title: callOptions.title,
          description: callOptions.description,
          input,
          suggestions: callOptions.suggestions,
        });
        // Block until Rust sends permission_response.
        const response = await new Promise<{ approved: boolean; updatedPermissions?: unknown[]; decisionClassification?: string; updatedInput?: Record<string, unknown> }>((resolve) => {
          pendingPermissions.set(id, resolve);
        });
        if (response.approved) {
          const result: { behavior: "allow"; updatedPermissions?: unknown[]; decisionClassification?: string; updatedInput?: Record<string, unknown> } = {
            behavior: "allow" as const,
          };
          if (response.updatedPermissions != null) {
            result.updatedPermissions = response.updatedPermissions;
          }
          if (response.decisionClassification != null) {
            result.decisionClassification = response.decisionClassification;
          }
          if (response.updatedInput != null) {
            result.updatedInput = response.updatedInput;
          }
          return result;
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

    // --- Memory System (Layers 2 & 3) ---
    let memoryStore: MemoryStore | null = null;
    if (memoryEnabled !== false) {
      memoryStore = new MemoryStore(id, repoId || "", emit);

      // Layer 2: Hook-based observation extraction
      options.hooks = {
        PostToolUse: [{
          hooks: [async (input: Record<string, unknown>) => {
            try {
              const obs = extractObservation(input as Parameters<typeof extractObservation>[0]);
              if (obs && memoryStore) {
                memoryStore.addObservation(obs);
              }
            } catch {
              // Never let memory errors break the agent
            }
            return {};
          }],
        }],
        SessionStart: [{
          hooks: [async (input: Record<string, unknown>) => {
            if (memoryStore && input.session_id) {
              memoryStore.setSessionId(input.session_id as string);
            }
            return {};
          }],
        }],
        SessionEnd: [{
          hooks: [async () => {
            try {
              if (memoryStore) {
                memoryStore.compressAndEmit();
              }
            } catch {
              // Never let memory errors break the agent
            }
            return {};
          }],
        }],
      };

      // Layer 3: In-process MCP server for on-demand memory access
      try {
        const memoryMcpServer = createMemoryMcpServer(memoryStore);
        options.mcpServers = {
          ...(options.mcpServers as Record<string, unknown> || {}),
          "fury-memory": memoryMcpServer,
        };
      } catch {
        // MCP server creation failed — continue without it
      }
    }

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
    resolver({
      approved: cmd.approved,
      updatedPermissions: cmd.updatedPermissions,
      decisionClassification: cmd.decisionClassification,
      updatedInput: cmd.updatedInput,
    });
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
